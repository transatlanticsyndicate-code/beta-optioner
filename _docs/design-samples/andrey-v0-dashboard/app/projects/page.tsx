import Layout from "@/components/kokonutui/layout"
import { Folder } from "lucide-react"

export default function ProjectsPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Folder className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          </div>
          <p className="text-muted-foreground">View and manage all your projects</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {[
            { name: "Website Redesign", status: "In Progress", progress: 65 },
            { name: "Mobile App", status: "Planning", progress: 20 },
            { name: "API Integration", status: "In Progress", progress: 80 },
            { name: "Marketing Campaign", status: "Completed", progress: 100 },
            { name: "Website Redesign", status: "In Progress", progress: 65 },
            { name: "Mobile App", status: "Planning", progress: 20 },
            { name: "API Integration", status: "In Progress", progress: 80 },
            { name: "Marketing Campaign", status: "Completed", progress: 100 }
          ].map((project) => (
            <div key={project.name} className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{project.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{project.status}</p>
              <div className="w-full bg-secondary rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${project.progress}%` }} />
              </div>
              <p className="text-sm text-muted-foreground mt-2">{project.progress}% complete</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
