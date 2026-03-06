import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';

const validate =
    (schema: Schema) =>
        (req: Request, res: Response, next: NextFunction): void => {
            const { error } = schema.validate(req.body, {
                abortEarly: false
            });

            if (error) {
                const errors = error.details.map((detail) => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));

                res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    errors
                });
                return;
            }

            next();
        };

export default validate;
