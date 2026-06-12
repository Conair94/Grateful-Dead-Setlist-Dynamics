"""Count-based baselines for next-song prediction.

UnigramModel: predicts the marginal song frequency regardless of context.
MarkovModel:  order-1 (bigram) transition model with add-alpha smoothing --
              the probabilistic model behind the website's "generative walk".

Both expose next_distribution(prefix) -> dict over token ids so they can be
scored by the shared evaluation loop in train.py.
"""
import numpy as np
from collections import Counter, defaultdict


class UnigramModel:
    name = "unigram"

    def __init__(self, vocab_size, alpha=0.1):
        self.vocab_size = vocab_size
        self.alpha = alpha
        self.probs = None

    def fit(self, shows):
        counts = Counter()
        for s in shows:
            counts.update(s["tokens"][1:])  # skip the era token itself
        total = sum(counts.values())
        self.probs = np.full(self.vocab_size, self.alpha)
        for tok, c in counts.items():
            self.probs[tok] += c
        self.probs /= self.probs.sum()
        return self

    def next_distribution(self, prefix):
        return self.probs


class MarkovModel:
    name = "markov-bigram"

    def __init__(self, vocab_size, alpha=0.05):
        self.vocab_size = vocab_size
        self.alpha = alpha
        self.transitions = defaultdict(Counter)
        self.fallback = None

    def fit(self, shows):
        unigram = Counter()
        for s in shows:
            toks = s["tokens"]
            for a, b in zip(toks[1:], toks[2:]):  # skip era->START transition
                self.transitions[a][b] += 1
            unigram.update(toks[1:])
        total = sum(unigram.values())
        self.fallback = np.full(self.vocab_size, self.alpha)
        for tok, c in unigram.items():
            self.fallback[tok] += c
        self.fallback /= self.fallback.sum()
        return self

    def next_distribution(self, prefix):
        prev = prefix[-1]
        row = self.transitions.get(prev)
        if not row:
            return self.fallback
        probs = np.full(self.vocab_size, self.alpha)
        for tok, c in row.items():
            probs[tok] += c
        probs /= probs.sum()
        return probs
