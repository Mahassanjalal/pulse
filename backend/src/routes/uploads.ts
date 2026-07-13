import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { authenticate, getAuthUser } from '../middleware/auth';
import { saveImage } from '../lib/storage';

export default async function uploadRoutes(app: FastifyInstance) {
  // Single multipart image upload. Returns the URL to store on the user or
  // message. Authentication required — only logged-in users may upload.
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    getAuthUser(req); // ensures a 401 is thrown when missing (authenticate runs first)

    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    try {
      const buffer = await data.toBuffer();
      const { url } = saveImage(buffer, data.mimetype);
      return { url };
    } catch (err: any) {
      // Stream the multipart part to completion so the connection closes cleanly.
      try {
        await data.toBuffer();
      } catch {
        /* already consumed */
      }
      return reply.status(400).send({ error: err.message || 'Upload failed' });
    }
  });
}
