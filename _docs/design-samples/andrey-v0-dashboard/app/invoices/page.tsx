import Layout from "@/components/kokonutui/layout"
import { Receipt } from "lucide-react"

export default function InvoicesPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Invoices</h1>
          </div>
          <p className="text-muted-foreground">Manage and track all your invoices</p>
        </div>

        <div className="grid gap-4">
          {[
            { id: "INV-001", client: "Client A", amount: "$2,500", date: "2024-01-15", status: "Paid" },
            { id: "INV-002", client: "Client B", amount: "$5,000", date: "2024-01-12", status: "Pending" },
            { id: "INV-003", client: "Client C", amount: "$1,200", date: "2024-01-10", status: "Overdue" },
          ].map((invoice) => (
            <div key={invoice.id} className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{invoice.id}</h3>
                  <p className="text-sm text-muted-foreground">{invoice.client}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-foreground">{invoice.amount}</p>
                  <p className="text-sm text-muted-foreground">{invoice.date}</p>
                </div>
              </div>
              <div className="mt-4">
                <span
                  className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                    invoice.status === "Paid"
                      ? "bg-accent text-accent-foreground"
                      : invoice.status === "Pending"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {invoice.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
