import { useMemo, useState } from "react";
import { ListTodo, Mail, MessageSquare, Copy, ExternalLink } from "lucide-react";
import { followUpTasks } from "@/data/follow-up-tasks";
import type { CustomerProfile } from "@/data/customers";
import type { Product } from "@/data/products";
import type { FollowUpTask } from "@/types/follow-up-task";
import { getOutreachTemplates, phoneForSmsUri } from "@/lib/outreach-templates";
import { sendStylistChat } from "@/lib/stylist-api";
import { getRuntimeChannel } from "@/lib/runtime-channel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AssociateTaskQueueProps {
  products: Product[];
  customers: CustomerProfile[];
  selectedCustomerId: string | null;
  liveTasks?: FollowUpTask[];
  onStartHelping?: (params: {
    customerId: string;
    productIds: string[];
    reservationId?: string;
    slotLabel?: string;
    totalCost?: number;
  }) => void;
}

function customerById(customers: CustomerProfile[], id: string): CustomerProfile | undefined {
  return customers.find((c) => c.id === id);
}

const priorityStyles: Record<FollowUpTask["priority"], string> = {
  high: "border-l-[hsl(var(--secondary))] bg-secondary/5",
  medium: "border-l-amber-500/80 bg-amber-500/[0.06]",
  low: "border-l-muted-foreground/40 bg-muted/30",
};

export function AssociateTaskQueue({
  products,
  customers,
  selectedCustomerId,
  liveTasks = [],
  onStartHelping,
}: AssociateTaskQueueProps) {
  const [activeTask, setActiveTask] = useState<FollowUpTask | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState<string>("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string>("");

  const associateId = "associate-ava";

  const sortedTasks = useMemo(() => {
    const order = { high: 0, medium: 1, low: 2 };
    const merged = [...liveTasks, ...followUpTasks];
    // De-dupe by id (live tasks win if collision).
    const byId = new Map<string, FollowUpTask>();
    for (const t of merged) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => order[a.priority] - order[b.priority]);
  }, [liveTasks]);

  const openQuickAction = (task: FollowUpTask) => {
    setActiveTask(task);
    setTemplatesOpen(true);
    setAiReply("");
    setAiBusy(false);
    setClaimError("");
  };

  const activeCustomer = activeTask ? customerById(customers, activeTask.customerId) : undefined;
  const outreach =
    activeTask && activeCustomer ? getOutreachTemplates(activeTask.type, activeCustomer) : null;

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const smsDigits = activeCustomer ? phoneForSmsUri(activeCustomer.phone) : "";
  const smsHref =
    outreach && activeCustomer && smsDigits
      ? `sms:${smsDigits}?body=${encodeURIComponent(outreach.smsBody)}`
      : "";

  const mailHref =
    outreach && activeCustomer && activeCustomer.email.trim()
      ? `mailto:${activeCustomer.email.trim()}?subject=${encodeURIComponent(outreach.emailSubject)}&body=${encodeURIComponent(outreach.emailBody)}`
      : "";

  return (
    <>
      <div className="h-full min-h-0 overflow-hidden rounded-2xl ios-surface flex flex-col">
        <div className="px-4 md:px-6 py-4 md:py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight">Task queue</h1>
              <p className="text-sm text-muted-foreground font-body">Follow-ups and outreach for your clients</p>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-3 md:p-4 space-y-3 max-w-3xl mx-auto pb-6">
            {sortedTasks.map((task) => {
              const cust = customerById(customers, task.customerId);
              const isSelectedContext = selectedCustomerId === task.customerId;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden border-l-4 transition-colors",
                    priorityStyles[task.priority],
                    isSelectedContext && "ring-2 ring-secondary/30 ring-offset-2 ring-offset-background",
                  )}
                >
                  <div className="p-4 md:p-5 flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-body">
                            {task.type.replace(/_/g, " ")}
                          </Badge>
                          {task.meta?.source === "connect" ? (
                            <Badge className="text-[10px] font-body bg-blue-600 hover:bg-blue-600">CONNECT</Badge>
                          ) : null}
                          <Badge variant="secondary" className="text-[10px] font-body">
                            Due {task.dueLabel}
                          </Badge>
                        </div>
                        <h2 className="font-display font-semibold text-foreground text-base md:text-lg">{task.title}</h2>
                        <p className="text-sm text-muted-foreground font-body mt-1">{task.summary}</p>
                        {cust && (
                          <p className="text-xs text-muted-foreground mt-2 font-body">
                            Customer: <span className="text-foreground font-medium">{cust.name}</span>
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="shrink-0 touch-target min-h-11 px-5 rounded-xl w-full sm:w-auto"
                        onClick={() => openQuickAction(task)}
                      >
                        Quick action
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Outreach templates</DialogTitle>
            <DialogDescription className="font-body text-left">
              {activeTask?.title}
              {activeCustomer ? ` · ${activeCustomer.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {activeTask?.type === "fitting_room_reserved" ? (
            <div className="space-y-4 overflow-y-auto pr-1 -mr-1">
              <section className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fitting room details</p>
                <p className="text-sm font-body mt-1">{activeTask.summary}</p>
                {activeCustomer ? (
                  <p className="text-xs text-muted-foreground mt-2 font-body">
                    Customer: <span className="text-foreground font-medium">{activeCustomer.name}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2 font-body">
                    Customer: <span className="text-foreground font-medium">Guest</span>
                  </p>
                )}
                {activeTask.meta?.productIds?.length ? (
                  <p className="text-xs text-muted-foreground font-body mt-2">
                    Items:{" "}
                    {activeTask.meta.productIds
                      .map((id) => products.find((p) => p.id === id)?.name ?? id)
                      .slice(0, 6)
                      .join(", ")}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={claimBusy}
                      onClick={async () => {
                        const eventId = activeTask.id.replace(/^live-/, "");
                        setClaimBusy(true);
                        setClaimError("");
                        try {
                          const res = await fetch("/api/v1/tasks/claim", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ eventId, associateId }),
                          });
                          if (!res.ok) {
                            const txt = await res.text();
                            throw new Error(txt || "Claim failed");
                          }
                          toast({ title: "Task claimed", description: "Jumping into the Store AI Assistant with this context." });
                          const productIds = activeTask.meta?.productIds ?? [];
                          onStartHelping?.({
                            customerId: activeTask.customerId || "guest",
                            productIds,
                            reservationId: activeTask.meta?.reservationId,
                            slotLabel: activeTask.meta?.slotLabel,
                            totalCost: activeTask.meta?.totalCost,
                          });
                          setTemplatesOpen(false);
                        } catch (e) {
                          setClaimError("This task is already assigned to another associate.");
                        } finally {
                          setClaimBusy(false);
                        }
                      }}
                    >
                      {claimBusy ? "Claiming…" : "Start helping"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={claimBusy}
                      onClick={async () => {
                        const eventId = activeTask.id.replace(/^live-/, "");
                        setClaimBusy(true);
                        setClaimError("");
                        try {
                          const res = await fetch("/api/v1/tasks/complete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ eventId, associateId }),
                          });
                          if (!res.ok) {
                            const txt = await res.text();
                            throw new Error(txt || "Complete failed");
                          }
                          toast({ title: "Marked done", description: "Removed from the live task queue." });
                          setTemplatesOpen(false);
                        } catch {
                          setClaimError("Could not mark complete (maybe assigned to someone else).");
                        } finally {
                          setClaimBusy(false);
                        }
                      }}
                    >
                      Mark done
                    </Button>
                  </div>
                  {claimError ? <p className="text-xs text-red-600 font-body">{claimError}</p> : null}
                </div>
              </section>
              {outreach && activeCustomer ? (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" /> SMS
                      </span>
                      <div className="flex gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => copy(outreach.smsBody, "SMS")}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </Button>
                        {smsHref ? (
                          <Button type="button" size="sm" className="h-8" asChild>
                            <a href={smsHref} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open SMS
                            </a>
                          </Button>
                        ) : (
                          <Button type="button" size="sm" className="h-8" disabled title="Add a phone number on the customer profile">
                            Open SMS
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm rounded-xl bg-muted/60 p-3 font-body whitespace-pre-wrap">{outreach.smsBody}</p>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => copy(`${outreach.emailSubject}\n\n${outreach.emailBody}`, "Email")}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy all
                        </Button>
                        {mailHref ? (
                          <Button type="button" size="sm" className="h-8" asChild>
                            <a href={mailHref} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open mail
                            </a>
                          </Button>
                        ) : (
                          <Button type="button" size="sm" className="h-8" disabled title="Add an email on the customer profile">
                            Open mail
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-foreground mb-1">{outreach.emailSubject}</p>
                    <p className="text-sm rounded-xl bg-muted/60 p-3 font-body whitespace-pre-wrap">{outreach.emailBody}</p>
                  </section>
                </>
              ) : null}
            </div>
          ) : outreach && activeCustomer ? (
            <div className="space-y-4 overflow-y-auto pr-1 -mr-1">
              {activeTask?.type === "fitting_room_reserved" ? (
                <section className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fitting room details</p>
                  <p className="text-sm font-body mt-1">{activeTask.summary}</p>
                  {activeTask.meta?.productIds?.length ? (
                    <p className="text-xs text-muted-foreground font-body mt-2">
                      Items:{" "}
                      {activeTask.meta.productIds
                        .map((id) => products.find((p) => p.id === id)?.name ?? id)
                        .slice(0, 6)
                        .join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={claimBusy}
                        onClick={async () => {
                          const eventId = activeTask.id.replace(/^live-/, "");
                          setClaimBusy(true);
                          setClaimError("");
                          try {
                            const res = await fetch("/api/v1/tasks/claim", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ eventId, associateId }),
                            });
                            if (!res.ok) {
                              const txt = await res.text();
                              throw new Error(txt || "Claim failed");
                            }
                            toast({ title: "Task claimed", description: "You’re now assigned. Jump in and start helping." });
                            const productIds = activeTask.meta?.productIds ?? [];
                            if (activeTask.customerId && productIds.length) {
                              onStartHelping?.({
                                customerId: activeTask.customerId,
                                productIds,
                                reservationId: activeTask.meta?.reservationId,
                                slotLabel: activeTask.meta?.slotLabel,
                                totalCost: activeTask.meta?.totalCost,
                              });
                            }
                            setTemplatesOpen(false);
                          } catch (e) {
                            setClaimError("This task is already assigned to another associate.");
                          } finally {
                            setClaimBusy(false);
                          }
                        }}
                      >
                        {claimBusy ? "Claiming…" : "Start helping"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={claimBusy}
                        onClick={async () => {
                          const eventId = activeTask.id.replace(/^live-/, "");
                          setClaimBusy(true);
                          setClaimError("");
                          try {
                            const res = await fetch("/api/v1/tasks/complete", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ eventId, associateId }),
                            });
                            if (!res.ok) {
                              const txt = await res.text();
                              throw new Error(txt || "Complete failed");
                            }
                            toast({ title: "Marked done", description: "Removed from the live task queue." });
                            setTemplatesOpen(false);
                          } catch {
                            setClaimError("Could not mark complete (maybe assigned to someone else).");
                          } finally {
                            setClaimBusy(false);
                          }
                        }}
                      >
                        Mark done
                      </Button>
                    </div>
                    {claimError ? <p className="text-xs text-red-600 font-body">{claimError}</p> : null}
                    <Button
                      type="button"
                      disabled={aiBusy}
                      onClick={async () => {
                        const ids = activeTask.meta?.productIds ?? [];
                        const itemNames = ids
                          .map((id) => products.find((p) => p.id === id)?.name ?? id)
                          .slice(0, 8)
                          .join("; ");
                        const ctx = `Customer has reserved a fitting room.\nReservation: ${activeTask.meta?.reservationId ?? "n/a"}\nTime: ${activeTask.meta?.slotLabel ?? "n/a"}\nItems: ${itemNames}\nTotal: $${activeTask.meta?.totalCost ?? "n/a"}`;
                        const prompt =
                          `${ctx}\n\nAs the associate, give me:\n` +
                          `1) 5 cross-sell suggestions (specific accessory/shoe/bag ideas) and why,\n` +
                          `2) 3 upsell talking points (higher-value upgrade options) and why,\n` +
                          `3) 2 quick questions to confirm preferences before she tries on.\n` +
                          `Keep it concise and actionable.`;
                        setAiBusy(true);
                        setAiReply("");
                        try {
                          const channel = getRuntimeChannel();
                          const res = await sendStylistChat({
                            message: prompt,
                            channel,
                            mode: channel === "associate_console" ? "clienteling" : "customer_led",
                            customerId: activeCustomer?.id,
                            history: [],
                          });
                          setAiReply(res.reply);
                        } catch {
                          setAiReply("Could not reach the Store AI Assistant. Make sure the API is running.");
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                    >
                      {aiBusy ? "Generating…" : "Generate cross-sell / up-sell plan"}
                    </Button>
                    {aiReply ? (
                      <div className="rounded-xl bg-muted/60 p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store AI Assistant</p>
                        <p className="text-sm font-body whitespace-pre-wrap">{aiReply}</p>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => copy(aiReply, "AI plan")}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> SMS
                  </span>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => copy(outreach.smsBody, "SMS")}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                    </Button>
                    {smsHref ? (
                      <Button type="button" size="sm" className="h-8" asChild>
                        <a href={smsHref} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open SMS
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" className="h-8" disabled title="Add a phone number on the customer profile">
                        Open SMS
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm rounded-xl bg-muted/60 p-3 font-body whitespace-pre-wrap">{outreach.smsBody}</p>
              </section>
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => copy(`${outreach.emailSubject}\n\n${outreach.emailBody}`, "Email")}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy all
                    </Button>
                    {mailHref ? (
                      <Button type="button" size="sm" className="h-8" asChild>
                        <a href={mailHref} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open mail
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" className="h-8" disabled title="Add an email on the customer profile">
                        Open mail
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">{outreach.emailSubject}</p>
                <p className="text-sm rounded-xl bg-muted/60 p-3 font-body whitespace-pre-wrap">{outreach.emailBody}</p>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-body">Customer record not found for this task.</p>
          )}
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="secondary" onClick={() => setTemplatesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
