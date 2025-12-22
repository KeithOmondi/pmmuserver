// utils/activityLogger.ts
import { Types } from "mongoose";
import { ActivityLog } from "../models/ActivityLog";

interface LogActivityInput {
  user: Types.ObjectId;
  action: string;
  entity?: string;
  entityId?: Types.ObjectId;
  meta?: Record<string, any>;
}

export const logActivity = async ({
  user,
  action,
  entity,
  entityId,
  meta,
}: LogActivityInput) => {
  await ActivityLog.create({
    user,
    action,
    entity,
    entityId,
    metadata: meta,
  });
};
