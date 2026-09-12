import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import type { Response } from 'express'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import {
  TenantContextMissingError,
  TenantOwnedRecordNotFoundError,
  TenantScopeViolationError,
} from '../prisma/tenant-scope.errors'

@Catch()
export class TenantExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const requestId = RequestContextStorage.get()?.requestId

    if (exception instanceof TenantOwnedRecordNotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'Resource not found',
        requestId,
      })
      return
    }

    if (exception instanceof TenantScopeViolationError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid tenant scope',
        requestId,
      })
      return
    }

    if (exception instanceof TenantContextMissingError) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Internal server error',
        requestId,
      })
      return
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      const body =
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse, requestId }
          : { ...(exceptionResponse as object), requestId }
      response.status(status).json(body)
      return
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      requestId,
    })
  }
}
