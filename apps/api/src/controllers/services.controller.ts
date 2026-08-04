import { createServiceSchema, updateServiceSchema } from "@bya/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody } from "../middlewares/validate.middleware.js";
import * as service from "../services/services.service.js";

/**
 * Handlers for the service catalogue. No business logic, no Mongoose —
 * parse/validate the request, call the service, shape the reply. Method, URL
 * and preHandlers live in `routes/services.routes.ts`.
 */

export async function listServicesHandler() {
  return { services: await service.listServices() };
}

export async function createServiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = parseBody(createServiceSchema, request.body);
  const created = await service.createService(input);
  return reply.status(201).send({ service: created });
}

export async function updateServiceHandler(request: FastifyRequest<{ Params: { id: string } }>) {
  const changes = parseBody(updateServiceSchema, request.body);
  return { service: await service.updateService(request.params.id, changes) };
}
