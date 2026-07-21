import { Readable } from 'stream';
import * as net from 'net';
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js';
import { parseClamAvResponse } from '../utils/clamavParseResponse.js';
import type { ScanResultResponse, IClamAVClient } from '../types/scan.types.js';
import { AWS_CONSTANTS } from '../constants/aws.constants.js';

export class ClamAVService implements IClamAVClient {
  private readonly context = 'ClamAVService';
  private host: string;
  private port: number;
  private readonly simulateMode: boolean;

  constructor() {
    this.host = process.env.CLAMAV_HOST || AWS_CONSTANTS.CLAMAV_DEFAULT_HOST;
    this.port = parseInt(process.env.CLAMAV_PORT || String(AWS_CONSTANTS.CLAMAV_DEFAULT_PORT));
    this.simulateMode = process.env.SIMULATE_SCAN === 'true';

    logInfo(this.context, 'ClamAV service initialized', {
      host: this.host,
      port: this.port,
      simulateMode: this.simulateMode,
    });
  }

  async scanStream(fileStream: Readable): Promise<ScanResultResponse> {
    logInfo(this.context, '[ClamAVService.ts][scanStream] STARTS');
    
    if (this.simulateMode) {
      logInfo(this.context, '[ClamAVService.ts][scanStream] Simulating virus scan (SIMULATE_SCAN=true)');
      const result = await this.simulateScan(fileStream);
      logInfo(this.context, '[ClamAVService.ts][scanStream] ENDS');
      return result;
    }

    logInfo(this.context, '[ClamAVService.ts][scanStream] Starting real virus scan', {
      host: this.host,
      port: this.port,
    });

    const startTime = Date.now();
    let bytesScanned = 0;

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.port, this.host);
      let responseData = '';

      socket.on('connect', () => {
        logDebug(this.context, '[ClamAVService.ts][scanStream] Connected to ClamAV daemon', {
          host: this.host,
          port: this.port,
        });

        socket.write('zINSTREAM\0');
        logDebug(this.context, '[ClamAVService.ts][scanStream] Sent INSTREAM command to ClamAV');
        
        fileStream.on('data', (chunk: Buffer) => {
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
          bytesScanned += chunk.length;

          if (bytesScanned % (1024 * 1024) === 0) {
            logDebug(this.context, '[ClamAVService.ts][scanStream] Scanning progress', {
              bytesScanned,
              megabytesScanned: (bytesScanned / (1024 * 1024)).toFixed(2),
            });
          }
        });

        fileStream.on('end', () => {
          logDebug(this.context, '[ClamAVService.ts][scanStream] File stream ended, sending terminator', {
            totalBytesScanned: bytesScanned,
          });

          const terminator = Buffer.alloc(4);
          terminator.writeUInt32BE(0, 0);
          socket.write(terminator);
        });

        fileStream.on('error', (err) => {
          logError(this.context, '[ClamAVService.ts][scanStream] File stream error', err);
          logError(this.context, '[ClamAVService.ts][scanStream] ENDS with error');
          socket.destroy();
          reject(err);
        });
      });

      socket.on('data', (data: Buffer) => {
        responseData += data.toString();
        logDebug(this.context, '[ClamAVService.ts][scanStream] Received data from ClamAV', {
          dataLength: data.length,
        });
      });

      socket.on('end', () => {
        const duration = Date.now() - startTime;
        logDebug(this.context, '[ClamAVService.ts][scanStream] ClamAV response received', {
          responseData,
          duration,
          bytesScanned,
        });

        try {
          const result = this.parseResponse(responseData);
          
          logInfo(this.context, '[ClamAVService.ts][scanStream] Virus scan completed', {
            isClean: result.isClean,
            virusName: result.virusName,
            bytesScanned,
            duration,
            throughput: bytesScanned / (duration / 1000),
          });

          logInfo(this.context, '[ClamAVService.ts][scanStream] ENDS');
          resolve(result);
        } catch (error) {
          logError(this.context, '[ClamAVService.ts][scanStream] Failed to parse ClamAV response', error as Error, {
            responseData,
          });
          logError(this.context, '[ClamAVService.ts][scanStream] ENDS with error');
          reject(error);
        }
      });

      socket.on('error', (err) => {
        logError(this.context, '[ClamAVService.ts][scanStream] ClamAV socket error', err, {
          host: this.host,
          port: this.port,
          bytesScanned,
        });
        logError(this.context, '[ClamAVService.ts][scanStream] ENDS with error');
        reject(err);
      });

      socket.on('timeout', () => {
        logError(this.context, '[ClamAVService.ts][scanStream] ClamAV socket timeout', undefined, {
          host: this.host,
          port: this.port,
          bytesScanned,
        });
        logError(this.context, '[ClamAVService.ts][scanStream] ENDS with error');
        socket.destroy();
        reject(new Error('ClamAV connection timeout'));
      });
    });
  }

  /**
   * Local-only scan stub. Detects the standard EICAR test string so INFECTED
   * UI/API paths can be exercised without clamd. All other content = CLEAN.
   */
  private async simulateScan(fileStream: Readable): Promise<ScanResultResponse> {
    logInfo(this.context, '[ClamAVService.ts][simulateScan] STARTS');

    const eicarMarker = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
    const chunks: Buffer[] = [];

    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const payload = Buffer.concat(chunks);
    const isEicar = payload.toString('utf8').includes(eicarMarker);

    const result: ScanResultResponse = isEicar
      ? { isClean: false, virusName: 'Eicar-Test-Signature' }
      : { isClean: true, virusName: null };

    logInfo(this.context, '[ClamAVService.ts][simulateScan] Simulated scan result', {
      isClean: result.isClean,
      virusName: result.virusName,
      bytesRead: payload.length,
    });
    logInfo(this.context, '[ClamAVService.ts][simulateScan] ENDS');
    return result;
  }

  private parseResponse(response: string): ScanResultResponse {
    logDebug(this.context, '[ClamAVService.ts][parseResponse] STARTS');

    logDebug(this.context, '[ClamAVService.ts][parseResponse] Parsing ClamAV response', {
      response: response.trim(),
      length: response.trim().length,
    });

    try {
      const result = parseClamAvResponse(response);

      if (result.isClean) {
        logInfo(this.context, '[ClamAVService.ts][parseResponse] File is clean (no virus detected)');
      } else {
        logWarn(this.context, '[ClamAVService.ts][parseResponse] Virus detected in file', {
          virusName: result.virusName,
          rawResponse: response.trim(),
        });
      }

      logDebug(this.context, '[ClamAVService.ts][parseResponse] ENDS');
      return result;
    } catch (error) {
      logError(this.context, '[ClamAVService.ts][parseResponse] Unexpected ClamAV response format', error as Error, {
        response: response.trim(),
      });
      logError(this.context, '[ClamAVService.ts][parseResponse] ENDS with error');
      throw error;
    }
  }
}
