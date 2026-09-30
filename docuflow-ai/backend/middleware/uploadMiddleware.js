/**
 * Upload middleware (multer, in-memory storage).
 *
 * Validates MIME type, extension and size before a controller ever sees the
 * file, and converts multer's own errors into friendly ValidationErrors.
 */
import multer from 'multer';
import { config } from '../config/env.js';
import { ValidationError } from '../utils/errors.js';
import { validateUpload, ALLOWED_EXTENSIONS } from '../utils/validators.js';

const storage = multer.memoryStorage();

function fileFilter(_request, file, callback) {
  const extension = `.${(file.originalname || '').split('.').pop()?.toLowerCase() || ''}`;
  const mimeOk = config.upload.allowedMimeTypes.includes(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(extension);

  if (!mimeOk && !extOk) {
    return callback(
      new ValidationError(
        `Unsupported file type. Supported formats: PDF, JPG, PNG (received "${extension || file.mimetype}").`,
      ),
    );
  }
  if (!extOk) {
    return callback(new ValidationError('Unsupported file extension. Supported formats: PDF, JPG, PNG.'));
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
    files: 2, // a second slot is reserved for document comparison
    fields: 20,
  },
});

/** Wraps a multer handler so upload errors become 400s with clean messages. */
export function handleUpload(handler) {
  return (request, response, next) => {
    handler(request, response, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(
            new ValidationError(
              `File is too large. Maximum allowed size is ${config.upload.maxFileSizeMb} MB.`,
            ),
          );
        }
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new ValidationError('Too many files. Please upload at most two documents.'));
        }
        return next(new ValidationError(`Upload failed: ${error.message}`));
      }
      next(error);
    });
  };
}

export const uploadSingle = () => handleUpload(upload.single('file'));
export const uploadPair = () => handleUpload(upload.fields([{ name: 'fileA', maxCount: 1 }, { name: 'fileB', maxCount: 1 }]));

/** Re-validates a file that has already passed through multer. */
export function assertValidFile(file) {
  validateUpload(file, {
    allowedMimeTypes: config.upload.allowedMimeTypes,
    maxFileSizeBytes: config.upload.maxFileSizeBytes,
  });
  return file;
}

export default { uploadSingle, uploadPair, handleUpload, assertValidFile };
