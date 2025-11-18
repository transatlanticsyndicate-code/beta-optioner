import Layout from "@/components/kokonutui/layout"
import { CreditCard } from "lucide-react"

export default function PaymentsPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Payments</h1>
          </div>
          <p className="text-muted-foreground">Manage payment methods and billing</p>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Payment Methods</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
                <div className="flex items-center gap-4">
                  <CreditCard className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">•••• •••• •••• 4242</p>
                    <p className="text-sm text-muted-foreground">Expires 12/25</p>
                  </div>
                </div>
                <span className="text-xs font-medium px-3 py-1 bg-accent text-accent-foreground rounded-full">
                  Default
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Billing History</h2>
            <div className="space-y-3">
              {[
                { date: "Jan 15, 2024", amount: "$99.00", status: "Paid" },
                { date: "Dec 15, 2023", amount: "$99.00", status: "Paid" },
                { date: "Nov 15, 2023", amount: "$99.00", status: "Paid" },
              ].map((bill, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{bill.date}</p>
                    <p className="text-sm text-muted-foreground">{bill.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{bill.amount}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
