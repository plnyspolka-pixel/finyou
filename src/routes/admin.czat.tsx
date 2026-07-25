import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { ChatInbox } from "@/components/chat/chat-inbox";

export const Route = createFileRoute("/admin/czat")({
  component: AdminChatInboxPage,
});

function AdminChatInboxPage() {
  return (
    <ChatInbox
      renderLeadLink={(leadId) => (
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/klienci/$id" params={{ id: leadId }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Otwórz lead
          </Link>
        </Button>
      )}
    />
  );
}
