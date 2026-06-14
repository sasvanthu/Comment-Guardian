import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Environment variables for Platform APIs
const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
const twitterBearerToken = Deno.env.get("TWITTER_BEARER_TOKEN") || "";

serve(async (req) => {
  // This webhook is designed to be called by a Supabase Postgres Trigger
  // whenever a comment row's "status" changes to "deleted" or "hidden".
  
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    
    // Postgres Trigger payload structure usually includes `record` and `old_record`
    const newRecord = payload.record;
    
    if (!newRecord) {
      return new Response("Invalid trigger payload", { status: 400 });
    }

    // Only process if the status changed to deleted
    if (newRecord.status !== "deleted" && newRecord.status !== "hidden") {
      return new Response("No action required", { status: 200 });
    }

    const platform = newRecord.platform;
    const externalId = newRecord.external_id; // You must add this column to your schema!

    if (!externalId) {
      return new Response("No external ID attached to comment, cannot sync.", { status: 200 });
    }

    let success = false;

    // Route to correct platform API
    if (platform === "instagram" || platform === "facebook") {
      // META GRAPH API DELETE REQUEST
      const res = await fetch(`https://graph.facebook.com/v19.0/${externalId}?access_token=${metaAccessToken}`, {
        method: newRecord.status === "deleted" ? "DELETE" : "POST",
        // If hidden, you can POST { hide: true } depending on the specific API endpoint
        body: newRecord.status === "hidden" ? JSON.stringify({ hide: true }) : undefined,
        headers: { "Content-Type": "application/json" }
      });
      success = res.ok;
    } 
    else if (platform === "twitter") {
      // TWITTER API v2 HIDE REPLY REQUEST
      // Note: Twitter doesn't let you delete someone else's tweet, you can only "hide" replies to your own tweet
      const res = await fetch(`https://api.twitter.com/2/tweets/${externalId}/hidden`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${twitterBearerToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ hidden: true })
      });
      success = res.ok;
    }

    return new Response(JSON.stringify({ synced: success, platform, action: newRecord.status }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
