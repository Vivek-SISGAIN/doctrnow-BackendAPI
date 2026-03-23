/**
 * Custom API Error class for structured error handling.
 * Extends native Error with HTTP status code and operational flag.
 */
class ApiError extends Error {
    constructor(statusCode, message, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message) {
        return new ApiError(400, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, message);
    }

    static forbidden(message = "Access denied") {
        return new ApiError(403, message);
    }

    static notFound(message = "Resource not found") {
        return new ApiError(404, message);
    }

    static conflict(message = "Resource already exists") {
        return new ApiError(409, message);
    }

    static internal(message = "Internal server error") {
        return new ApiError(500, message, false);
    }

    static tooManyRequests(message = "Too many requests") {
        return new ApiError(429, message);
    }
}

module.exports = ApiError;
