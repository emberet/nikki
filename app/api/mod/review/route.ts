import { json } from "@/lib/http";
export async function POST() {
  return json(
    {
      error:
        "Individual moderator publication is retired. Use community voting.",
    },
    410,
  );
}
