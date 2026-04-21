class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function notFound(msg = 'Not found') {
  return new HttpError(404, msg);
}

function unauthorized(msg = 'Unauthorized') {
  return new HttpError(401, msg);
}

function forbidden(msg = 'Forbidden') {
  return new HttpError(403, msg);
}

function conflict(msg = 'Conflict') {
  return new HttpError(409, msg);
}

function badRequest(msg = 'Bad request') {
  return new HttpError(400, msg);
}

module.exports = { HttpError, notFound, unauthorized, forbidden, conflict, badRequest };
