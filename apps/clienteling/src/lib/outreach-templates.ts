import type { CustomerProfile } from "@/data/customers";
import type { FollowUpTask, FollowUpTaskType } from "@/types/follow-up-task";

export interface OutreachTemplates {
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}

function firstName(customer: CustomerProfile): string {
  return customer.name.trim().split(/\s+/)[0] ?? "there";
}

const builders: Record<FollowUpTaskType, (customer: CustomerProfile) => OutreachTemplates> = {
  birthday: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! Wishing you a wonderful birthday week from your friends at Ann Taylor. We’d love to help you celebrate — reply if you’d like a private styling slot or a small gift wrapped for pickup.`,
      emailSubject: `${fn}, happy birthday from Ann Taylor`,
      emailBody: `Hi ${fn},\n\nHappy birthday from all of us at Ann Taylor! We hope this year brings everything you’re styling for.\n\nIf you’d like, we can set aside pieces that match your love of ${c.stylePreferences.slice(0, 2).join(" & ")} — just reply or visit the store.\n\nWarmly,\nYour store team`,
    };
  },
  anniversary: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! Thinking of you ahead of your special dinner — want us to hold a few date-night options in your size? Happy to coordinate a quick fitting.`,
      emailSubject: `Your anniversary look — we’re here to help, ${fn}`,
      emailBody: `Hi ${fn},\n\nWe remembered you have something special coming up. If you’d like fresh options for the evening, we can pull dresses and accessories in your usual size and fit.\n\nReply to book a short appointment or ask for photos of new arrivals.\n\nBest,\nAnn Taylor`,
    };
  },
  new_collection: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! New spring pieces just landed that match your style profile. Want a text-back “YES” and we’ll set aside 3 looks for you to try on your next visit?`,
      emailSubject: `New arrivals picked with you in mind`,
      emailBody: `Hi ${fn},\n\nFresh styles are in, and several pieces align with the looks you love (${c.stylePreferences.slice(0, 3).join(", ")}).\n\nVisit anytime or reply and we’ll reserve a fitting room with your name on it.\n\nAnn Taylor`,
    };
  },
  event_reminder: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! With event season here, we can pull outfit ideas that work with your calendar. Reply EVENT and we’ll follow up with times.`,
      emailSubject: `Outfit ideas for your upcoming events`,
      emailBody: `Hi ${fn},\n\nWe’d love to help you feel ready for what’s on your calendar — from garden parties to evenings out. Tell us the vibe and we’ll pre-pull options.\n\nSee you soon,\nAnn Taylor`,
    };
  },
  win_back: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! We noticed you browsing online — need sizing help or a hold at the store? Text back and we’ll take care of it.`,
      emailSubject: `Can we help you finish your look?`,
      emailBody: `Hi ${fn},\n\nThanks for shopping with us online. If something didn’t feel quite right, we’re happy to suggest alternates or hold pieces in your size (${c.preferredSize}, ${c.preferredFit}).\n\nAnn Taylor`,
    };
  },
  fitting_room_reserved: (c) => {
    const fn = firstName(c);
    return {
      smsBody: `Hi ${fn}! Your fitting room is reserved and an associate has your items ready. Reply if you need to adjust timing or want a second size pulled.`,
      emailSubject: `Your fitting room is ready, ${fn}`,
      emailBody: `Hi ${fn},\n\nYour fitting room has been reserved and we’re staging your selected items now.\n\nIf you’d like to adjust timing or add one more piece to try, reply to this email.\n\nWarmly,\nYour store team`,
    };
  },
};

export function getOutreachTemplates(taskType: FollowUpTaskType, customer: CustomerProfile): OutreachTemplates {
  return builders[taskType](customer);
}

/** E.164-style recipient for sms: URI; empty string if not usable. */
export function phoneForSmsUri(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return "";
}
