import { NextRequest, NextResponse } from 'next/server';
import { GET as DynamicGET, PUT as DynamicPUT, DELETE as DynamicDELETE } from '../../[type]/[id]/route';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return DynamicGET(request, { params: Promise.resolve({ type: 'slack', id }) });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return DynamicPUT(request, { params: Promise.resolve({ type: 'slack', id }) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return DynamicDELETE(request, { params: Promise.resolve({ type: 'slack', id }) });
}
