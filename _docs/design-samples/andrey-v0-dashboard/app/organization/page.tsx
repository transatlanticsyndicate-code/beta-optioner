import Layout from "@/components/kokonutui/layout"
import { Building2 } from "lucide-react"

export default function OrganizationPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Organization</h1>
          </div>
          <p className="text-muted-foreground">Manage your organization settings and structure</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Organization Details</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Organization Name</label>
              <p className="text-lg text-foreground mt-1">Acme Corporation</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Industry</label>
              <p className="text-lg text-foreground mt-1">Technology</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Team Size</label>
              <p className="text-lg text-foreground mt-1">50-100 employees</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
