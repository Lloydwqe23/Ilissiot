import { useEffect } from "react";
import { useRoute } from "wouter";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatWindow } from "@/components/chat-window";
import { MessageNotification } from "@/components/message-notification";
import { useAuth } from "@/hooks/use-auth";
import { useChatWebSocket } from "@/hooks/use-websocket";
import { useNotificationManager } from "@/hooks/use-notifications";
import { motion } from "framer-motion";

/**
 * On mobile, auto-open the sidebar sheet when no chat is selected
 * and prevent it from being closed (there's nothing behind it).
 */
function MobileSidebarController({ hasChatOpen }: { hasChatOpen: boolean }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile && !hasChatOpen && !openMobile) {
      setOpenMobile(true);
    }
  }, [isMobile, hasChatOpen, openMobile, setOpenMobile]);

  return null;
}

export function ChatLayout() {
  const [match, params] = useRoute("/chat/:id");
  const { user } = useAuth();
  const { notifications, addNotification, dismissNotification } = useNotificationManager();
  
  // Get active chat ID for notification filtering
  const activeChatId = match && params.id ? parseInt(params.id) : null;
  
  // Initialize WebSocket connection with notification callback
  useChatWebSocket(user?.id, addNotification, activeChatId);

  const hasChatOpen = !!(match && params.id);

  // Styling for Shadcn SidebarProvider
  const sidebarStyle = {
    "--sidebar-width": "22rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <MobileSidebarController hasChatOpen={hasChatOpen} />
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <ChatSidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {match && params.id ? (
            <ChatWindow chatId={parseInt(params.id)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f8f9fa] dark:bg-[#0e1621]">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <img 
                  src="/favicon.png" 
                  alt="Ilissiot" 
                  className="w-20 h-20 rounded-2xl shadow-sm border border-border mx-auto"
                />
                <div className="space-y-1">
                  <h3 className="text-xl font-display font-semibold text-foreground">Ilissiot Web</h3>
                  <p className="text-muted-foreground text-sm max-w-[250px] mx-auto">
                    Select a chat from the sidebar or start a new conversation.
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </main>
      </div>

      {/* Message Notifications */}
      <MessageNotification 
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </SidebarProvider>
  );
}
