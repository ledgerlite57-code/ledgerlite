import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { SavedViewCreateInput, SavedViewEntity, SavedViewUpdateInput } from "@ledgerlite/shared";

type SavedViewRecord = {
  id: string;
  entityType: SavedViewEntity;
  name: string;
  query: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSavedViews(orgId?: string, userId?: string, entityType?: SavedViewEntity): Promise<SavedViewRecord[]> {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!userId) {
      throw new ConflictException("Missing user context");
    }

    const where: Prisma.SavedViewWhereInput = { orgId, userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const views = await this.prisma.savedView.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return views.map((view) => this.mapView(view));
  }

  async createSavedView(orgId?: string, userId?: string, input?: SavedViewCreateInput): Promise<SavedViewRecord> {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!userId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    try {
      const created = await this.prisma.savedView.create({
        data: {
          orgId,
          userId,
          entityType: input.entityType,
          name: input.name,
          queryJson: input.query ?? {},
        },
      });
      return this.mapView(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Saved view name already exists");
      }
      throw err;
    }
  }

  async updateSavedView(
    orgId?: string,
    userId?: string,
    viewId?: string,
    input?: SavedViewUpdateInput,
  ): Promise<SavedViewRecord> {
    if (!orgId || !viewId) {
      throw new NotFoundException("Saved view not found");
    }
    if (!userId) {
      throw new ConflictException("Missing user context");
    }
    if (!input || (input.name === undefined && input.query === undefined)) {
      throw new BadRequestException("Nothing to update");
    }

    const existing = await this.prisma.savedView.findFirst({
      where: { id: viewId, orgId, userId },
    });
    if (!existing) {
      throw new NotFoundException("Saved view not found");
    }

    const data: Prisma.SavedViewUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.query !== undefined) {
      data.queryJson = input.query;
    }

    try {
      const updated = await this.prisma.savedView.update({
        where: { id: existing.id },
        data,
      });
      return this.mapView(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Saved view name already exists");
      }
      throw err;
    }
  }

  async deleteSavedView(orgId?: string, userId?: string, viewId?: string) {
    if (!orgId || !viewId) {
      throw new NotFoundException("Saved view not found");
    }
    if (!userId) {
      throw new ConflictException("Missing user context");
    }

    const existing = await this.prisma.savedView.findFirst({
      where: { id: viewId, orgId, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("Saved view not found");
    }

    await this.prisma.savedView.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }

  private mapView(view: { id: string; entityType: string; name: string; queryJson: Prisma.JsonValue; createdAt: Date; updatedAt: Date; }): SavedViewRecord {
    return {
      id: view.id,
      entityType: view.entityType as SavedViewEntity,
      name: view.name,
      query: (view.queryJson ?? {}) as Record<string, string>,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
