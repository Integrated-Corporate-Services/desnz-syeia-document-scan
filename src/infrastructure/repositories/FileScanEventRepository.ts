import { QueryResult } from 'pg';
import { query } from '../database/connection.js';
import type { FileScanEvent } from '../../domain/entities/FileScanEvent.js';
import { logDebug, logError, logInfo } from '../../utils/logger.js';

export interface IFileScanEventRepository {
  findByEventId(eventId: string): Promise<FileScanEvent | null>;
  recordEvent(
    eventId: string,
    fileId: string,
    s3Key: string,
    status: string
  ): Promise<boolean>;
}

export class FileScanEventRepository implements IFileScanEventRepository {
  private readonly context = 'FileScanEventRepository';

  async findByEventId(eventId: string): Promise<FileScanEvent | null> {
    logDebug(this.context, 'Querying for scan event', { eventId });
    
    try {
      const result: QueryResult<FileScanEvent> = await query(
        `SELECT event_id, file_id, s3_key, status, created_at
         FROM public.file_scan_events
         WHERE event_id = $1`,
        [eventId]
      );
      
      const event = result.rows[0] || null;
      
      if (event) {
        logDebug(this.context, 'Scan event found (duplicate detected)', {
          eventId,
          fileId: event.file_id,
          status: event.status,
          createdAt: event.created_at,
        });
      } else {
        logDebug(this.context, 'No existing scan event found (new event)', { eventId });
      }
      
      return event;
    } catch (error) {
      logError(this.context, 'Failed to query scan event', error as Error, { eventId });
      throw error;
    }
  }

  async recordEvent(
    eventId: string,
    fileId: string,
    s3Key: string,
    status: string
  ): Promise<boolean> {
    logInfo(this.context, 'Recording scan event', {
      eventId,
      fileId,
      s3Key,
      status,
    });
    
    try {
      const result: QueryResult<{ event_id: string }> = await query(
        `INSERT INTO public.file_scan_events (event_id, file_id, s3_key, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [eventId, fileId, s3Key, status]
      );
      
      const recorded = result.rows.length > 0;
      
      if (recorded) {
        logInfo(this.context, 'Scan event recorded successfully', {
          eventId,
          fileId,
        });
      } else {
        logDebug(this.context, 'Scan event not recorded (duplicate)', {
          eventId,
          fileId,
        });
      }
      
      return recorded;
    } catch (error) {
      logError(this.context, 'Failed to record scan event', error as Error, {
        eventId,
        fileId,
        s3Key,
        status,
      });
      throw error;
    }
  }
}
