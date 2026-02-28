export interface ActiveUser {
  id: string;
  email: string;
}

import { Request } from 'express';
export interface RequestWithUser extends Request {
  user: ActiveUser;
}
