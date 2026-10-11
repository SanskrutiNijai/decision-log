const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function generateText(env, messages) {
  const response = await env.AI.run(MODEL, {
    messages,
  });

  return response.response;
}
