import { redirect } from "next/navigation";

type LegacyParams = {
  id: string;
};

export default function PurchaseOrderLegacyDetailPage({
  params,
}: {
  params: LegacyParams;
}) {
  const { id } = params;
  redirect(`/purchase-orders/${id}`);
}
