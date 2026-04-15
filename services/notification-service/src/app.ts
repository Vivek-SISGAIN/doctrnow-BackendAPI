import express, { Request, Response, NextFunction } from 'express';
import routes from './routes';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api', routes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
