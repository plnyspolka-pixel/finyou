import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { ChatInbox } from "@/components/chat/chat-inbox";

export const Route = createFileRoute("/operator/czat")({
  component: OperatorChatInboxPage,
});

function OperatorChatInboxPage() {
  return (
    <ChatInbox
      renderLeadLink={(leadId) => (
        <Button asChild variant="outline" size="sm">
          <Link to="/operator/leady/$id" params={{ id: leadId }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Otwórz lead
          </Link>
        </Button>
      )}
    />
  );
}
