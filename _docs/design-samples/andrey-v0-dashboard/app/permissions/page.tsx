import Layout from "@/components/kokonutui/layout"
import { Shield } from "lucide-react"

export default function PermissionsPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Permissions</h1>
          </div>
          <p className="text-muted-foreground">Manage roles and access permissions</p>
        </div>

        <div className="space-y-4">
          {[
            { role: "Admin", permissions: ["Full Access", "User Management", "Settings", "Billing"] },
            { role: "Manager", permissions: ["View Reports", "Manage Projects", "View Team"] },
            { role: "Developer", permissions: ["View Projects", "Edit Code", "View Documentation"] },
            { role: "Designer", permissions: ["View Projects", "Edit Designs", "View Assets"] },
          ].map((item) => (
            <div key={item.role} className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">{item.role}</h3>
              <div className="flex flex-wrap gap-2">
                {item.permissions.map((permission) => (
                  <span key={permission} className="px-3 py-1 bg-accent text-accent-foreground rounded-full text-sm">
                    {permission}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
