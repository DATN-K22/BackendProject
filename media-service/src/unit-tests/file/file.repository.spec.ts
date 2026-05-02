import { Test, TestingModule } from '@nestjs/testing';
import { FileRepository } from '../../modules/file/file.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { Logger } from '@nestjs/common';

const mockPrisma = {
  resource: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn()
  }
};

describe('FileRepository', () => {
  let repository: FileRepository;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileRepository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile();

    repository = module.get<FileRepository>(FileRepository);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create resource and return mapped fields', async () => {
      const dto: any = { title: 't', type: 'video', course_id: '10' };
      const path = 'videos/10/100';
      const filename = 'file_hls.m3u8';

      mockPrisma.resource.create.mockResolvedValue({ id: 1n, lesson_id: 100n, title: 't' });

      const result = await repository.create(dto, path, filename);

      expect(mockPrisma.resource.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Object) }));
      expect(result).toEqual(expect.objectContaining({ id: '1', chapter_item_id: '100', lesson_id: '100' }));
    });
  });

  describe('findById', () => {
    it('should call prisma.findFirst', async () => {
      mockPrisma.resource.findFirst.mockResolvedValue({ id: 1n });
      const res = await repository.findById(1);
      expect(mockPrisma.resource.findFirst).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(res).toEqual({ id: 1n });
    });
  });

  describe('deleteById', () => {
    it('should call prisma.delete', async () => {
      mockPrisma.resource.delete.mockResolvedValue({ id: 1n });
      const res = await repository.deleteById(1);
      expect(mockPrisma.resource.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(res).toEqual({ id: 1n });
    });
  });

  describe('findResourcesByChapterItemId', () => {
    it('should call findMany with BigInt', async () => {
      mockPrisma.resource.findMany.mockResolvedValue([{ id: 1n, lesson_id: 100n }]);
      const res = await repository.findResourcesByChapterItemId('100');
      expect(mockPrisma.resource.findMany).toHaveBeenCalledWith({ where: { lesson_id: BigInt('100') } });
      expect(res).toEqual([{ id: 1n, lesson_id: 100n }]);
    });
  });
});
