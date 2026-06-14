import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Environment variables provided by Supabase Edge Functions
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const perspectiveApiKey = Deno.env.get("PERSPECTIVE_API_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // 1. Verify Method
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();

    // 2. Extract Data (Example assuming a normalized webhook payload or Meta webhook)
    // You will need to adjust this depending on the exact JSON structure of Instagram/X
    const author = payload.entry?.[0]?.changes?.[0]?.value?.from?.username || payload.author || "unknown";
    const text = payload.entry?.[0]?.changes?.[0]?.value?.text || payload.text || "";
    const platform = payload.platform || "instagram"; // Fallback to instagram
    const contentType = payload.content_type || "comment";

    if (!text) {
      return new Response("No text found in payload", { status: 400 });
    }

    // 3. Call Perspective API to score toxicity
    let toxicityScore = 0;
    let category = "safe";
    
    if (perspectiveApiKey) {
      const perspectiveRes = await fetch(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${perspectiveApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: { text },
          languages: ["en"],
          requestedAttributes: {
            TOXICITY: {},
            SEVERE_TOXICITY: {},
            IDENTITY_ATTACK: {},
            INSULT: {},
            PROFANITY: {},
            THREAT: {}
          }
        })
      });

      if (perspectiveRes.ok) {
        const perspectiveData = await perspectiveRes.json();
        toxicityScore = Math.round(perspectiveData.attributeScores?.TOXICITY?.summaryScore?.value * 100) || 0;
        
        // Basic category routing
        if (toxicityScore > 80) category = "toxic";
        if (perspectiveData.attributeScores?.THREAT?.summaryScore?.value > 0.6) category = "threats";
        if (perspectiveData.attributeScores?.IDENTITY_ATTACK?.summaryScore?.value > 0.6) category = "hate";
      }
    }

    // 4. Insert into Supabase (TrustLens UI will instantly pick this up)
    const { data: insertedComment, error } = await supabase.from("comments").insert({
      platform,
      author,
      text,
      sentiment: toxicityScore > 60 ? "negative" : toxicityScore < 20 ? "positive" : "neutral",
      category,
      content_type: contentType
      // You can store the raw external ID if you want to sync actions back later
      // external_id: payload.comment_id 
    }).select().single();

    if (error) {
      console.error("Supabase Error:", error);
      throw error;
    }

    // 5. Log the ingestion
    await supabase.from("activity_logs").insert({
      action: "ingest",
      target: author,
      details: { platform, reason: "webhook auto-ingest" }
    });

    return new Response(JSON.stringify({ success: true, id: insertedComment.id }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
