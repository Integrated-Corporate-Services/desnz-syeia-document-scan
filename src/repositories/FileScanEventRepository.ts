import { QueryResult } from 'pg';
import { query } from '../config/databasePool.js';
import type { FileScanEvent } from '../types/FileScanEvent.js';
import type { IFileScanEventRepository } from '../types/scan.types.js';
import { FILE_SCAN_QUERIES } from '../queries/scan.queries.js';
import { logDebug, logError, logInfo } from '../utils/logger.js';

export class FileScanEventRepository implements IFileScanEventRepository {
  private readonly context = 'FileScanEventRepository';

  async findByEventId(eventId: string): Promise<FileScanEvent | null> {
    logDebug(this.context, '[FileScanEventRepository.ts][findByEventId] STARTS', { eventId });
    logDebug(this.context, '[FileScanEventRepository.ts][findByEventId] Querying for scan event', { eventId });
    
    try {
      const result: QueryResult<FileScanEvent> = await query(
        FILE_SCAN_QUERIES.FIND_EVENT_BY_ID,
        [eventId]
      );
      
      const event = result.rows[0] || null;
      
      if (event) {
        logDebug(this.context, '[FileScanEventRepository.ts][findByEventId] Scan event found (duplicate detected)', {
          eventId,
          fileId: event.file_id,
          status: event.status,
          createdAt: event.created_at,
        });
      } else {
        logDebug(this.context, '[FileScanEventRepository.ts][findByEventId] No existing scan event found (new event)', { eventId });
      }
      
      logDebug(this.context, '[FileScanEventRepository.ts][findByEventId] ENDS');
      return event;
    } catch (error) {
      logError(this.context, '[FileScanEventRepository.ts][findByEventId] Failed to query scan event', error as Error, { eventId });
      logError(this.context, '[FileScanEventRepository.ts][findByEventId] ENDS with error');
      throw error;
    }
  }

  async recordEvent(
    eventId: string,
    fileId: string,
    s3Key: string,
    status: string
  ): Promise<boolean> {
    logInfo(this.context, '[FileScanEventRepository.ts][recordEvent] STARTS', {
      eventId,
      fileId,
      s3Key,
      status,
    });
    logInfo(this.context, '[FileScanEventRepository.ts][recordEvent] Recording scan event', {
      eventId,
      fileId,
      s3Key,
      status,
    });
    
    try {
      const result: QueryResult<{ event_id: string }> = await query(
        FILE_SCAN_QUERIES.RECORD_EVENT,
        [eventId, fileId, s3Key, status]
      );
      
      const recorded = result.rows.length > 0;
      
      if (recorded) {
        logInfo(this.context, '[FileScanEventRepository.ts][recordEvent] Scan event recorded successfully', {
          eventId,
          fileId,
        });
      } else {
        logDebug(this.context, '[FileScanEventRepository.ts][recordEvent] Scan event not recorded (duplicate)', {
          eventId,
          fileId,
        });
      }
      
      logInfo(this.context, '[FileScanEventRepository.ts][recordEvent] ENDS');
      return recorded;
    } catch (error) {
      logError(this.context, '[FileScanEventRepository.ts][recordEvent] Failed to record scan event', error as Error, {
        eventId,
        fileId,
        s3Key,
        status,
      });
      logError(this.context, '[FileScanEventRepository.ts][recordEvent] ENDS with error');
      throw error;
    }
  }
}
