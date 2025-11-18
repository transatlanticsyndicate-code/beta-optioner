import Layout from "@/components/kokonutui/layout"
import { Video } from "lucide-react"

export default function MeetingsPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Video className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Meetings</h1>
          </div>
          <p className="text-muted-foreground">Schedule and manage team meetings</p>
        </div>

        <div className="space-y-4">
          {[
            { title: "Weekly Standup", date: "Today, 2:00 PM", attendees: 8, duration: "30 min" },
            { title: "Project Review", date: "Tomorrow, 10:00 AM", attendees: 5, duration: "1 hour" },
            { title: "Client Presentation", date: "Jan 20, 3:00 PM", attendees: 12, duration: "45 min" },
          ].map((meeting, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{meeting.title}</h3>
                  <p className="text-sm text-muted-foreground mb-1">{meeting.date}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{meeting.attendees} attendees</span>
                    <span>•</span>
                    <span>{meeting.duration}</span>
                  </div>
                </div>
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
                  Join
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
