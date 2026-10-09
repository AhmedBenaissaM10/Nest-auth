import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let request: { url: string; method: string };
  let response: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let host: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();

    request = {
      url: '/tasks',
      method: 'POST',
    };

    response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    host = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(request),
        getResponse: vi.fn().mockReturnValue(response),
      }),
    };

    // keep test output clean (the filter logs unexpected errors)
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle NotFoundException', () => {
    request.url = '/tasks/123';
    request.method = 'GET';

    const exception = new NotFoundException('Task not found');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(404);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 404,
        message: 'Task not found',
        path: '/tasks/123',
        method: 'GET',
      }),
    );
  });

  it('should handle BadRequestException', () => {
    const exception = new BadRequestException('Invalid input');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(400);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        message: 'Invalid input',
        path: '/tasks',
        method: 'POST',
      }),
    );
  });

  it('should handle unexpected Errors', () => {
    const exception = new Error('Database Connection Failed');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(500);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        path: '/tasks',
        method: 'POST',
      }),
    );
  });
});
