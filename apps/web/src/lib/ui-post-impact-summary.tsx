import type { ReactNode } from "react";
import { formatMoney } from "./format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui-table";

type LedgerPreviewLine = {
  label: string;
  debit?: number | null;
  credit?: number | null;
};

type PostImpactSummaryProps = {
  mode: "post" | "void";
  ledgerLines?: LedgerPreviewLine[];
  currency?: string;
  children?: ReactNode;
};

const copyByMode = {
  post: {
    title: "Posting creates ledger entries",
    body: "Posting locks this document into the accounting records. You can void later, which creates a reversal entry.",
  },
  void: {
    title: "Voiding creates a reversal",
    body: "Voiding keeps the original entry for audit and adds a reversing entry. Reports will show both entries and net to zero.",
  },
};

export const PostImpactSummary = ({ mode, ledgerLines, currency, children }: PostImpactSummaryProps) => {
  const copy = copyByMode[mode];
  const hasLedger = Boolean(ledgerLines?.length && currency);

  return (
    <div className="post-impact">
      <div className="post-impact-title">{copy.title}</div>
      <p className="muted">{copy.body}</p>
      {hasLedger ? (
        <>
          <div style={{ height: 12 }} />
          <strong>Ledger impact</strong>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Debit</TableHead>
                <TableHead>Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerLines?.map((line, index) => (
                <TableRow key={`${line.label}-${index}`}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell>{line.debit ? formatMoney(line.debit, currency as string) : "-"}</TableCell>
                  <TableCell>{line.credit ? formatMoney(line.credit, currency as string) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
      {children ? (
        <>
          <div style={{ height: 12 }} />
          {children}
        </>
      ) : null}
    </div>
  );
};
