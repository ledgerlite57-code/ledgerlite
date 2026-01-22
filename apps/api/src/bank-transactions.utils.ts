export type ImportTransaction = {
  externalRef?: string | null;
};

export type DedupedImportResult<T extends ImportTransaction> = {
  unique: T[];
  skipped: number;
};

export function dedupeImportTransactions<T extends ImportTransaction>(transactions: T[]): DedupedImportResult<T> {
  const seen = new Set<string>();
  const unique: T[] = [];
  let skipped = 0;

  for (const transaction of transactions) {
    const rawRef = transaction.externalRef?.trim();
    if (!rawRef) {
      unique.push(transaction);
      continue;
    }

    if (seen.has(rawRef)) {
      skipped += 1;
      continue;
    }

    seen.add(rawRef);
    unique.push({ ...transaction, externalRef: rawRef });
  }

  return { unique, skipped };
}
