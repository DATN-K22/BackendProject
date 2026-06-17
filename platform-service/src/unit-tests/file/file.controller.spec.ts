import { Test, TestingModule } from '@nestjs/testing';
import { FileController } from '../../modules/file/file.controller';
import { FileService } from '../../modules/file/file.service';
import { Logger } from '@nestjs/common';
import { ResourceType } from '../../modules/file/dto/request/create-file.dto';

const mockFileService = {
  createMany: jest.fn(),
  generatePresignedUrls: jest.fn(),
  remove: jest.fn(),
  findResourcesByChapterItemId: jest.fn(),
  findResourcesByLessonId: jest.fn(),
  initVideoUpload: jest.fn(),
  getPartPresignedUrl: jest.fn(),
  listUploadedParts: jest.fn(),
  completeVideoUpload: jest.fn()
};

describe('FileController', () => {
  let controller: FileController;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [{ provide: FileService, useValue: mockFileService }]
    }).compile();

    controller = module.get<FileController>(FileController);
    jest.clearAllMocks();
  });

  describe('createMany', () => {
    it('should call service and return ApiResponse with multiple files', async () => {
      const dto = {
        files: [
          {
            course_id: '10',
            lesson_id: '5',
            type: ResourceType.DOCUMENT,
            filename: 'doc.pdf',
            title: 'Document'
          },
          {
            course_id: '10',
            lesson_id: '5',
            type: ResourceType.IMAGE,
            filename: 'image.png',
            title: 'Image'
          }
        ]
      };

      const created = [
        { id: 1, title: 'Document', path: 'documents/10/5', filename: 'doc.pdf' },
        { id: 2, title: 'Image', path: 'images/10/5', filename: 'image.png' }
      ];

      mockFileService.createMany.mockResolvedValue(created);

      const result = await controller.createMany(dto);

      expect(mockFileService.createMany).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({
        success: true,
        data: created,
        message: 'Save records successfully'
      });
    });

    it('should handle single file in createMany', async () => {
      const dto = {
        files: [
          {
            course_id: '10',
            chapter_item_id: '5',
            type: ResourceType.DOCUMENT,
            filename: 'doc.pdf',
            title: 'Document'
          }
        ]
      };

      const created = [{ id: 1, title: 'Document', path: 'documents/10/5', filename: 'doc.pdf' }];

      mockFileService.createMany.mockResolvedValue(created);

      const result = await controller.createMany(dto);

      expect(result.data).toHaveLength(1);
      expect(mockFileService.createMany).toHaveBeenCalledWith(dto);
    });
  });

  describe('getPresignedUrls', () => {
    it('should generate presigned urls for document upload', async () => {
      const dto = {
        courseId: '10',
        lessonId: '5',
        files: [
          { filename: 'doc.pdf', contentType: 'application/pdf' },
          { filename: 'guide.pdf', contentType: 'application/pdf' }
        ]
      };

      const presignedUrls = [
        {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          key: 'documents/10/5/doc.pdf',
          presignedUrl: 'https://s3/presigned-1',
          expiresAt: new Date()
        },
        {
          filename: 'guide.pdf',
          contentType: 'application/pdf',
          key: 'documents/10/5/guide.pdf',
          presignedUrl: 'https://s3/presigned-2',
          expiresAt: new Date()
        }
      ];

      mockFileService.generatePresignedUrls.mockResolvedValue(presignedUrls);

      const result = await controller.getPresignedUrls(dto);

      expect(mockFileService.generatePresignedUrls).toHaveBeenCalledWith(dto);
      expect(result.success).toBe(true);
      expect(result.data as any).toHaveLength(2);
      expect((result.data as any)[0]).toHaveProperty('presignedUrl');
    });

    it('should generate presigned urls for image upload', async () => {
      const dto = {
        courseId: '10',
        chapterItemId: '5',
        files: [{ filename: 'banner.png', contentType: 'image/png' }]
      };

      const presignedUrls = [
        {
          filename: 'banner.png',
          contentType: 'image/png',
          key: 'images/10/5/banner.png',
          presignedUrl: 'https://s3/presigned',
          expiresAt: new Date()
        }
      ];

      mockFileService.generatePresignedUrls.mockResolvedValue(presignedUrls);

      const result = await controller.getPresignedUrls(dto);

      expect(result.data as any).toHaveLength(1);
      expect((result.data as any)[0].contentType).toBe('image/png');
    });
  });

  describe('remove', () => {
    it('should delete file by id', async () => {
      mockFileService.remove.mockResolvedValue({ success: true });

      const result = await controller.remove('1');

      expect(mockFileService.remove).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true });
    });

    it('should call remove with parsed id as number', async () => {
      mockFileService.remove.mockResolvedValue({ success: true });

      await controller.remove('123');

      expect(mockFileService.remove).toHaveBeenCalledWith(123);
    });
  });

  describe('findResourcesByChapterItemId', () => {
    it('should return grouped resources by chapter item', async () => {
      const grouped = {
        document: [{ id: 1, title: 'Doc', filename: 'doc.pdf', link: 'https://cdn/doc' }],
        video: [{ id: 2, title: 'Video', filename: 'video.m3u8', link: 'https://cdn/video' }],
        image: [{ id: 3, title: 'Image', filename: 'image.png', link: 'https://cdn/image' }]
      };

      mockFileService.findResourcesByChapterItemId.mockResolvedValue(grouped);

      const result = await controller.findResourcesByChapterItemId('5');

      expect(mockFileService.findResourcesByChapterItemId).toHaveBeenCalledWith('5');
      expect(result).toMatchObject({
        success: true,
        data: grouped
      });
      expect((result.data as any).document).toHaveLength(1);
      expect((result.data as any).video).toHaveLength(1);
      expect((result.data as any).image).toHaveLength(1);
    });

    it('should return empty groups when no resources found', async () => {
      const grouped = { document: [], video: [], image: [] };

      mockFileService.findResourcesByChapterItemId.mockResolvedValue(grouped);

      const result = await controller.findResourcesByChapterItemId('99');

      expect(result.data).toEqual({ document: [], video: [], image: [] });
    });
  });

  describe('findResourcesByLessonId', () => {
    it('should return grouped resources by lesson', async () => {
      const grouped = {
        document: [{ id: 1, title: 'Doc', filename: 'doc.pdf', link: 'https://cdn/doc' }],
        video: [],
        image: []
      };

      mockFileService.findResourcesByLessonId.mockResolvedValue(grouped);

      const result = await controller.findResourcesByLessonId('10');

      expect(mockFileService.findResourcesByLessonId).toHaveBeenCalledWith('10');
      expect(result).toMatchObject({
        success: true,
        data: grouped
      });
      expect((result.data as any).document).toHaveLength(1);
    });
  });

  describe('initVideoUpload', () => {
    it('should initialize video upload session', async () => {
      const dto = {
        title: 'Lesson 1 Video',
        courseId: '10',
        lessonId: '5',
        fileSize: 524288000 // 500MB
      };

      const uploadSession = {
        uploadId: 'upload-id-123',
        key: 'videos/10/5/main.mp4',
        totalParts: 11,
        partSize: 52428800 // 50MB
      };

      mockFileService.initVideoUpload.mockResolvedValue(uploadSession);

      const result = await controller.initVideoUpload(dto);

      expect(mockFileService.initVideoUpload).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({
        success: true,
        data: uploadSession,
        message: 'Upload session created'
      });
      expect((result.data as any).uploadId).toBe('upload-id-123');
      expect((result.data as any).totalParts).toBe(11);
    });

    it('should return partition size info', async () => {
      const dto = {
        title: 'Video',
        courseId: '10',
        lessonId: '5',
        fileSize: 1000000000
      };

      const uploadSession = {
        uploadId: 'upload-id-456',
        key: 'videos/10/5/main.mp4',
        totalParts: 20,
        partSize: 52428800
      };

      mockFileService.initVideoUpload.mockResolvedValue(uploadSession);

      const result = await controller.initVideoUpload(dto);

      expect((result.data as any).partSize).toBe(52428800);
    });
  });

  describe('getPartPresignedUrl', () => {
    it('should get presigned url for a specific part', async () => {
      const dto = { partNumber: 1 };
      const presignedUrlResponse = {
        partNumber: 1,
        presignedUrl: 'https://s3/presigned-part-1',
        expiresAt: new Date()
      };

      mockFileService.getPartPresignedUrl.mockResolvedValue(presignedUrlResponse);

      const result = await controller.getPartPresignedUrl('upload-id-123', dto);

      expect(mockFileService.getPartPresignedUrl).toHaveBeenCalledWith('upload-id-123', 1);
      expect(result).toMatchObject({
        success: true,
        data: presignedUrlResponse
      });
    });

    it('should handle multiple parts requests', async () => {
      const presignedUrlResponse = {
        partNumber: 5,
        presignedUrl: 'https://s3/presigned-part-5',
        expiresAt: new Date()
      };

      mockFileService.getPartPresignedUrl.mockResolvedValue(presignedUrlResponse);

      const result = await controller.getPartPresignedUrl('upload-id-123', { partNumber: 5 });

      expect((result.data as any).partNumber).toBe(5);
    });
  });

  describe('listParts', () => {
    it('should list uploaded parts and missing parts', async () => {
      const partsResponse = {
        uploadedParts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' }
        ],
        missingParts: [3, 4, 5]
      };

      mockFileService.listUploadedParts.mockResolvedValue(partsResponse);

      const result = await controller.listParts('upload-id-123');

      expect(mockFileService.listUploadedParts).toHaveBeenCalledWith('upload-id-123');
      expect(result).toMatchObject({
        success: true,
        data: partsResponse
      });
      expect((result.data as any).uploadedParts).toHaveLength(2);
      expect((result.data as any).missingParts).toHaveLength(3);
    });

    it('should show all parts uploaded when complete', async () => {
      const partsResponse = {
        uploadedParts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' }
        ],
        missingParts: []
      };

      mockFileService.listUploadedParts.mockResolvedValue(partsResponse);

      const result = await controller.listParts('upload-id-456');

      expect((result.data as any).missingParts).toHaveLength(0);
    });
  });

  describe('completeVideoUpload', () => {
    it('should complete video upload and return resource id', async () => {
      const dto = {
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' }
        ]
      };

      const completeResponse = { resourceId: 1 };

      mockFileService.completeVideoUpload.mockResolvedValue(completeResponse);

      const result = await controller.completeVideoUpload('upload-id-123', dto);

      expect(mockFileService.completeVideoUpload).toHaveBeenCalledWith('upload-id-123', dto);
      expect(result).toMatchObject({
        success: true,
        data: completeResponse
      });
      expect(result.message).toBe('');
    });

    it('should handle completion with multiple parts', async () => {
      const dto = {
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
          { partNumber: 3, etag: '"etag-3"' }
        ]
      };

      const completeResponse = { resourceId: 5 };

      mockFileService.completeVideoUpload.mockResolvedValue(completeResponse);

      const result = await controller.completeVideoUpload('upload-id-456', dto);

      expect((result.data as any).resourceId).toBe(5);
      expect(mockFileService.completeVideoUpload).toHaveBeenCalledWith('upload-id-456', dto);
    });
  });
});
