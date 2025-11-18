import Layout from "@/components/kokonutui/layout"
import { Users2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function MembersPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Users2 className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Team Members</h1>
          </div>
          <p className="text-muted-foreground">Manage your team members and their roles</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              name: "John Doe",
              role: "Admin",
              email: "john@example.com",
              avatar: "/placeholder.svg?height=40&width=40",
            },
            {
              name: "Jane Smith",
              role: "Developer",
              email: "jane@example.com",
              avatar: "/placeholder.svg?height=40&width=40",
            },
            {
              name: "Mike Johnson",
              role: "Designer",
              email: "mike@example.com",
              avatar: "/placeholder.svg?height=40&width=40",
            },
            {
              name: "Sarah Williams",
              role: "Manager",
              email: "sarah@example.com",
              avatar: "/placeholder.svg?height=40&width=40",
            },
          ].map((member) => (
            <div key={member.email} className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center gap-4 mb-4">
                <Avatar>
                  <AvatarImage src={member.avatar || "/placeholder.svg"} alt={member.name} />
                  <AvatarFallback>
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-foreground">{member.name}</h3>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{member.email}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
