import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import {
  TELEMETRY_UNSPECIFIED_RECEIPT,
  type TelemetryJourneyEndRequest,
  type TelemetryJourneyInteractionRequest,
  type TelemetryJourneyProgressRequest,
} from '@devvit/analytics/shared/reddit';

export const telemetryRoutes = new Hono();

telemetryRoutes.post('/journey/app-ready', async (c) => {
  try {
    const res = await telemetry.appReady();
    return c.json(res, 200);
  } catch {
    return c.json({ receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 200);
  }
});

telemetryRoutes.post('/journey/start', async (c) => {
  try {
    const res = await telemetry.startJourney();
    return c.json(res, 200);
  } catch {
    return c.json(
      { journeyId: '', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      200
    );
  }
});

telemetryRoutes.post('/journey/progress', async (c) => {
  try {
    const body = (await c.req.json()) as TelemetryJourneyProgressRequest;
    if (!body?.journeyId || typeof body.progress !== 'number') {
      return c.json(
        {
          error: 'Invalid progress payload',
          receipt: TELEMETRY_UNSPECIFIED_RECEIPT,
        },
        400
      );
    }

    const res = await telemetry.journeyProgress({
      journeyId: body.journeyId,
      progress: body.progress,
      action: body.action ?? '',
      actionDetails: body.actionDetails ?? '',
    });
    return c.json(res, 200);
  } catch {
    return c.json({ receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 200);
  }
});

telemetryRoutes.post('/journey/interaction', async (c) => {
  try {
    const body = (await c.req.json()) as TelemetryJourneyInteractionRequest;
    if (!body?.action) {
      return c.json(
        {
          error: 'Invalid interaction payload',
          receipt: TELEMETRY_UNSPECIFIED_RECEIPT,
        },
        400
      );
    }

    const res = await telemetry.journeyInteraction({
      journeyId: body.journeyId ?? '',
      action: body.action,
      actionDetails: body.actionDetails ?? '',
    });
    return c.json(res, 200);
  } catch {
    return c.json({ receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 200);
  }
});

telemetryRoutes.post('/journey/end', async (c) => {
  try {
    const body = (await c.req.json()) as TelemetryJourneyEndRequest;
    if (!body?.journeyId) {
      return c.json(
        {
          error: 'Invalid end payload',
          receipt: TELEMETRY_UNSPECIFIED_RECEIPT,
        },
        400
      );
    }

    const res = await telemetry.endJourney(
      body.game
        ? {
            journeyId: body.journeyId,
            complete: body.complete ?? true,
            game: body.game,
          }
        : {
            journeyId: body.journeyId,
            complete: body.complete ?? true,
          }
    );
    return c.json(res, 200);
  } catch {
    return c.json({ receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 200);
  }
});