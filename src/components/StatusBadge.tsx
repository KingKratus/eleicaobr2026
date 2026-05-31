type Status = "validado" | "pendente" | "rejeitado";

const styles: Record<Status, string> = {
  validado: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  rejeitado: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
