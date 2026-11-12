import { supabase } from "./lib/supabase.js";

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();
const day = (days) => iso(days).slice(0, 10);

// [title, description, status, priority, due (days from today | null), created (days ago)]
const DEMO = [
  {
    name: "Website Redesign",
    description: "New marketing site: brand refresh, faster pages, better conversion.",
    tasks: [
      ["Audit current site", "Review analytics, heatmaps and top exit pages.", "done", "medium", -6, 7],
      ["Define new sitemap", "Cut the navigation down to five core pages.", "done", "low", -4, 6],
      ["Design homepage hero", "Three concepts, then one round of team feedback.", "in_progress", "high", 1, 4],
      ["Build component library", "Buttons, cards, forms, tokens and dark mode.", "in_progress", "medium", 5, 3],
      ["Write launch copy", "Headline, feature blurbs and the pricing page.", "todo", "medium", 8, 2],
      ["Fix mobile navigation", "Menu overlaps the logo on small screens.", "todo", "high", -2, 1],
    ],
  },
  {
    name: "Mobile App Launch",
    description: "Ship v1.0 to the App Store and Google Play.",
    tasks: [
      ["Finalize onboarding flow", "Three screens, skippable, with a progress indicator.", "done", "high", -3, 6],
      ["Push notification setup", "Permissions, channels and quiet hours.", "in_progress", "high", 2, 5],
      ["Beta test with 20 users", "TestFlight invites and a feedback form.", "in_progress", "medium", 4, 3],
      ["Prepare store screenshots", "Six screens per device size.", "todo", "low", 9, 2],
      ["Submit for review", "Release notes and privacy labels.", "todo", "high", 12, 0],
    ],
  },
  {
    name: "Marketing Campaign",
    description: "Q1 campaign across email, social and partner channels.",
    tasks: [
      ["Plan content calendar", "Twelve weeks, three themes.", "done", "medium", -5, 5],
      ["Record product video", "60-second walkthrough with captions.", "in_progress", "medium", 3, 2],
      ["Set up email sequence", "Five-step nurture flow with A/B subject lines.", "todo", "high", 6, 1],
      ["Partner outreach", "Shortlist ten newsletters and reach out.", "todo", "low", null, 0],
    ],
  },
];

export async function seedDemoData() {
  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
  if (count > 0) return;

  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth.user.id;

  for (const project of DEMO) {
    const { data: created, error } = await supabase
      .from("projects")
      .insert({ name: project.name, description: project.description, owner_id: ownerId })
      .select("id")
      .single();
    if (error) throw error;

    const rows = project.tasks.map(([title, description, status, priority, due, ago]) => ({
      project_id: created.id,
      title,
      description,
      status,
      priority,
      due_date: due === null ? null : day(due),
      created_at: iso(-ago),
    }));

    let result = await supabase.from("tasks").insert(rows);
    if (result.error) {
      // fall back if created_at isn't writable in your schema
      result = await supabase.from("tasks").insert(rows.map(({ created_at, ...rest }) => rest));
    }
    if (result.error) throw result.error;
  }
}

export async function startDemo() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  await seedDemoData();
}
