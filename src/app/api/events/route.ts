import { handleEventRequest } from "@/lib/event-request";
import { submitEvent } from "@/lib/events";

export async function POST(request: Request) {
  return handleEventRequest(request, submitEvent);
}
