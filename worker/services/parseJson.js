// Turn an LLM response (object or string, possibly wrapped in ```json fences)
// into a parsed JavaScript object.
export function parseLLMJson(result) {
  if (result && typeof result === "object") {
    return result;
  }

  if (typeof result !== "string") {
    throw new Error("AI returned an unsupported response type");
  }

  const text = result
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    console.error("Invalid AI JSON:", result);
    throw new Error("AI returned invalid JSON");
  }
}
