import { NextRequest } from 'next/server';
import { POST as DynamicPOST } from '../../../../../admin/notifications/[type]/create/route';

export async function POST(request: NextRequest) {
  return DynamicPOST(request, { params: Promise.resolve({ type: 'pushbullet' }) });
}
