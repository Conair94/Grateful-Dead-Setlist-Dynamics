"""Small causal (GPT-style) transformer for next-song prediction.

Design choices, sized for a ~45k-token corpus (tiny by language-model
standards -- the danger here is overfitting, not underfitting):

- decoder-only with a causal attention mask: each position can only attend
  to earlier songs in the show, which is exactly the forecasting setup.
- weight tying between the input embedding and the output projection,
  a standard small-data regularizer (Press & Wolf 2017).
- optional feature-augmented embeddings: token embedding + a linear
  projection of the song's era-normalized Essentia features, so sonically
  similar songs share embedding space even when one is rare.
- learned positional embeddings (shows are short; max ~64 positions).
"""
import math
import torch
import torch.nn as nn


class SetlistTransformer(nn.Module):
    def __init__(self, vocab_size, d_model=128, n_heads=4, n_layers=3,
                 d_ff=256, dropout=0.3, max_len=64,
                 feature_matrix=None, pad_id=0):
        super().__init__()
        self.pad_id = pad_id
        self.max_len = max_len

        self.token_emb = nn.Embedding(vocab_size, d_model, padding_idx=pad_id)
        self.pos_emb = nn.Embedding(max_len, d_model)
        self.drop = nn.Dropout(dropout)

        if feature_matrix is not None:
            feats = torch.as_tensor(feature_matrix, dtype=torch.float32)
            self.register_buffer("song_features", feats)
            self.feat_proj = nn.Linear(feats.shape[1], d_model)
        else:
            self.song_features = None
            self.feat_proj = None

        layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_ff,
            dropout=dropout, batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.norm = nn.LayerNorm(d_model)

        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.head.weight = self.token_emb.weight  # weight tying

    def forward(self, x):
        B, T = x.shape
        pos = torch.arange(T, device=x.device).unsqueeze(0)
        h = self.token_emb(x) + self.pos_emb(pos)
        if self.feat_proj is not None:
            h = h + self.feat_proj(self.song_features[x])
        h = self.drop(h)

        causal = nn.Transformer.generate_square_subsequent_mask(T, device=x.device)
        pad_mask = x == self.pad_id
        h = self.encoder(h, mask=causal, src_key_padding_mask=pad_mask,
                         is_causal=True)
        return self.head(self.norm(h))

    @torch.no_grad()
    def generate(self, prefix_ids, end_id, max_new=40, temperature=1.0,
                 forbid_repeats=None, device="cpu"):
        """Sample a continuation. forbid_repeats: set of token ids that may
        appear at most once per show (the band rarely repeats a song)."""
        self.eval()
        seq = list(prefix_ids)
        seen = set(seq)
        for _ in range(max_new):
            x = torch.tensor([seq[-self.max_len:]], device=device)
            logits = self(x)[0, -1] / temperature
            if forbid_repeats:
                for tok in seen & forbid_repeats:
                    logits[tok] = -float("inf")
            logits[self.pad_id] = -float("inf")
            probs = torch.softmax(logits, dim=-1)
            nxt = torch.multinomial(probs, 1).item()
            seq.append(nxt)
            seen.add(nxt)
            if nxt == end_id:
                break
        return seq
