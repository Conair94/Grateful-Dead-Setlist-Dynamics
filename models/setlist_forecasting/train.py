"""Train and compare next-song prediction models.

Usage (from the repo root):
    python3 -m models.setlist_forecasting.train               # random split
    python3 -m models.setlist_forecasting.train --split temporal
    python3 -m models.setlist_forecasting.train --no-features  # ablation

Evaluation protocol: every model is scored on the same positions of the
same held-out shows -- predicting token t_i given the true prefix t_<i
("teacher forcing"). Scoring starts at i=2 so the trivial era->START
transition is excluded. Metrics:

  top-1 / top-5  accuracy of the predicted next token
  perplexity     exp(mean NLL); lower = the model is less surprised

reported both over all tokens and over song-only positions (the hard part:
predicting <END> after an encore is easy, predicting which of ~480 songs
comes next is not).
"""
import argparse
import math
import time

import numpy as np
import torch
import torch.nn as nn

from .dataset import load_corpus, split_shows, PAD, START, END, ERA_BUCKETS, era_token
from .markov import UnigramModel, MarkovModel
from .transformer import SetlistTransformer


# ---------------- shared evaluation ----------------

def eval_count_model(model, shows, first_song_id):
    """Score a model exposing next_distribution(prefix)."""
    stats = {"all": [0, 0, 0, 0.0], "song": [0, 0, 0, 0.0]}  # n, top1, top5, nll
    for s in shows:
        toks = s["tokens"]
        for i in range(2, len(toks)):
            probs = model.next_distribution(toks[:i])
            target = toks[i]
            top5 = np.argpartition(probs, -5)[-5:]
            top1 = top5[np.argmax(probs[top5])]
            nll = -math.log(max(probs[target], 1e-12))
            for key in (["all", "song"] if target >= first_song_id else ["all"]):
                st = stats[key]
                st[0] += 1
                st[1] += int(top1 == target)
                st[2] += int(target in top5)
                st[3] += nll
    return _finalize(stats)


@torch.no_grad()
def eval_transformer(model, shows, first_song_id, device, batch_size=64):
    model.eval()
    stats = {"all": [0, 0, 0, 0.0], "song": [0, 0, 0, 0.0]}
    for i in range(0, len(shows), batch_size):
        batch = shows[i:i + batch_size]
        x, y = make_batch(batch, model.pad_id, device)
        logits = model(x)                      # (B, T, V)
        logp = torch.log_softmax(logits, dim=-1)
        top5 = logits.topk(5, dim=-1).indices  # (B, T, 5)
        for b, s in enumerate(batch):
            toks = s["tokens"]
            for j in range(1, len(toks) - 1):  # y[j] = toks[j+1]; start at i=2
                target = toks[j + 1]
                t5 = top5[b, j].tolist()
                nll = -logp[b, j, target].item()
                for key in (["all", "song"] if target >= first_song_id else ["all"]):
                    st = stats[key]
                    st[0] += 1
                    st[1] += int(t5[0] == target)
                    st[2] += int(target in t5)
                    st[3] += nll
    return _finalize(stats)


def _finalize(stats):
    out = {}
    for key, (n, t1, t5, nll) in stats.items():
        out[key] = {
            "n": n,
            "top1": t1 / n if n else 0.0,
            "top5": t5 / n if n else 0.0,
            "ppl": math.exp(nll / n) if n else float("inf"),
        }
    return out


def make_batch(shows, pad_id, device):
    max_len = max(len(s["tokens"]) for s in shows)
    x = torch.full((len(shows), max_len - 1), pad_id, dtype=torch.long)
    y = torch.full((len(shows), max_len - 1), pad_id, dtype=torch.long)
    for b, s in enumerate(shows):
        toks = torch.tensor(s["tokens"], dtype=torch.long)
        x[b, :len(toks) - 1] = toks[:-1]
        y[b, :len(toks) - 1] = toks[1:]
    return x.to(device), y.to(device)


# ---------------- training ----------------

def train_transformer(corpus, train_shows, val_shows, device,
                      use_features=True, epochs=60, batch_size=32,
                      lr=3e-4, seed=42):
    torch.manual_seed(seed)
    feature_matrix = corpus.features if use_features else None
    max_len = max(len(s["tokens"]) for s in corpus.shows) + 1
    model = SetlistTransformer(
        corpus.vocab_size, max_len=max_len,
        feature_matrix=feature_matrix,
        pad_id=corpus.token_to_id[PAD],
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  transformer params: {n_params/1e3:.0f}k | features: {use_features} | device: {device}")

    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    loss_fn = nn.CrossEntropyLoss(ignore_index=model.pad_id, label_smoothing=0.05)

    best_val, best_state, patience, bad = float("inf"), None, 8, 0
    first_song_id = corpus.vocab_size - corpus.n_songs

    for epoch in range(epochs):
        model.train()
        order = np.random.permutation(len(train_shows))
        total, steps = 0.0, 0
        for i in range(0, len(order), batch_size):
            batch = [train_shows[j] for j in order[i:i + batch_size]]
            x, y = make_batch(batch, model.pad_id, device)
            logits = model(x)
            loss = loss_fn(logits.reshape(-1, logits.shape[-1]), y.reshape(-1))
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += loss.item()
            steps += 1

        val = eval_transformer(model, val_shows, first_song_id, device)
        val_ppl = val["all"]["ppl"]
        marker = ""
        if val_ppl < best_val - 1e-3:
            best_val, bad = val_ppl, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            marker = " *"
        else:
            bad += 1
        if epoch % 5 == 0 or marker:
            print(f"  epoch {epoch:3d} | train loss {total/steps:.3f} | "
                  f"val ppl {val_ppl:6.2f} | val song top5 {val['song']['top5']:.3f}{marker}")
        if bad >= patience:
            print(f"  early stop at epoch {epoch} (no val improvement for {patience} epochs)")
            break

    if best_state:
        model.load_state_dict(best_state)
    return model


# ---------------- main ----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["random", "temporal"], default="random")
    ap.add_argument("--no-features", action="store_true")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--device", default=None)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--save", default="models/setlist_forecasting/checkpoint.pt")
    args = ap.parse_args()

    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")

    corpus = load_corpus()
    train_shows, val_shows, test_shows = split_shows(
        corpus.shows, mode=args.split, seed=args.seed)
    n_tokens = sum(len(s["tokens"]) for s in corpus.shows)
    print(f"corpus: {len(corpus.shows)} shows | {corpus.n_songs} songs | "
          f"{n_tokens} tokens | split={args.split} "
          f"({len(train_shows)}/{len(val_shows)}/{len(test_shows)})")
    if args.split == "temporal":
        print(f"  train ends {max(s['date'] for s in train_shows)}, "
              f"test starts {min(s['date'] for s in test_shows)}")

    first_song_id = len(corpus.vocab) - corpus.n_songs

    results = {}
    print("\n[1/3] unigram baseline")
    results["unigram"] = eval_count_model(
        UnigramModel(corpus.vocab_size).fit(train_shows), test_shows, first_song_id)

    print("[2/3] markov bigram (the website's generative-walk model)")
    results["markov"] = eval_count_model(
        MarkovModel(corpus.vocab_size).fit(train_shows), test_shows, first_song_id)

    print("[3/3] transformer")
    t0 = time.time()
    model = train_transformer(corpus, train_shows, val_shows, device,
                              use_features=not args.no_features,
                              epochs=args.epochs, seed=args.seed)
    print(f"  trained in {time.time()-t0:.0f}s")
    results["transformer"] = eval_transformer(model, test_shows, first_song_id, device)

    if args.save:
        torch.save({"state_dict": model.state_dict(),
                    "vocab": corpus.vocab,
                    "use_features": not args.no_features}, args.save)
        print(f"  checkpoint saved to {args.save}")

    print(f"\n=== test-set results ({args.split} split) ===")
    header = f"{'model':<14}{'scope':<7}{'n':>7}{'top-1':>8}{'top-5':>8}{'ppl':>9}"
    print(header)
    print("-" * len(header))
    for name, res in results.items():
        for scope in ["all", "song"]:
            r = res[scope]
            print(f"{name:<14}{scope:<7}{r['n']:>7}{r['top1']:>8.3f}"
                  f"{r['top5']:>8.3f}{r['ppl']:>9.2f}")

    # Qualitative check: sample a 1977-style show
    print("\n=== sampled setlist, conditioned on <ERA_1975-1979> ===")
    prefix = [corpus.token_to_id[era_token("1975-1979")], corpus.token_to_id[START]]
    song_ids = set(range(first_song_id, corpus.vocab_size))
    seq = model.generate(prefix, corpus.token_to_id[END], max_new=35,
                         temperature=0.9, forbid_repeats=song_ids, device=device)
    for tok in corpus.decode(seq[1:]):
        print("  " + tok)


if __name__ == "__main__":
    main()
