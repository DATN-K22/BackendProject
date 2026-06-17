import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  Logger
} from '@nestjs/common';
import { FileService } from '../../modules/file/file.service';
import { FileRepository } from '../../modules/file/file.repository';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_BROKER } from '../../modules/message-broker/message-broker.token';
import { ResourceType } from '../../modules/file/dto/request/create-file.dto';

const mockFileRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  deleteById: jest.fn(),
  findResourcesByChapterItemId: jest.fn(),
  findResourcesByLessonId: jest.fn(),
  findActiveUploadSession: jest.fn(),
  findVideoByLessonId: jest.fn(),
  createVideoResource: jest.fn(),
  findUploadSessionByUploadId: jest.fn(),
  updateUploadSessionStatus: jest.fn(),
  listUploadedParts: jest.fn(),
  finalizeVideoUpload: jest.fn()
};

const mockCloudStorage = {
  getPresignedUrlForAccessing: jest.fn(),
  deleteFile: jest.fn(),
  getPresignedUrl: jest.fn(),
  createMultipartUpload: jest.fn(),
  getPresignedUrlForPart: jest.fn(),
  listUploadedParts: jest.fn(),
  completeMultipartUpload: jest.fn()
};

const mockCdnService = {
  getPresignedUrlForCloudFront: jest.fn()
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-bucket')
};

const mockMessageBroker = {
  sendFileUrlForAIProcessing: jest.fn()
};

describe('FileService', () => {
  let service: FileService;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: 'CLOUD_STORAGE_SERVICE', useValue: mockCloudStorage },
        { provide: 'CDN_SERVICE', useValue: mockCdnService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileRepository, useValue: mockFileRepository },
        { provide: MESSAGE_BROKER, useValue: mockMessageBroker }
      ]
    }).compile();

    service = module.get<FileService>(FileService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw BadRequestException when no resource owner id provided', async () => {
      const dto = { type: ResourceType.DOCUMENT, filename: 'doc.pdf', title: 'Document' };
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when trying to upload video via create', async () => {
      const dto = {
        course_id: '10',
        type: ResourceType.VIDEO,
        filename: 'video.mp4',
        title: 'Video'
      };
      await expect(service.create(dto as any)).rejects.toThrow('Use POST /files/video/init for video uploads');
    });

    it('should create document with chapter_item_id', async () => {
      const dto = {
        course_id: '10',
        chapter_item_id: '5',
        type: ResourceType.DOCUMENT,
        filename: 'doc.pdf',
        title: 'Document'
      };
      const createdFile = { id: 1, title: 'Document', path: 'documents/10/5', filename: 'doc.pdf' };

      mockFileRepository.create.mockResolvedValue(createdFile);
      mockCloudStorage.getPresignedUrlForAccessing.mockResolvedValue('https://s3/example');
      mockMessageBroker.sendFileUrlForAIProcessing.mockResolvedValue(true);

      const result = await service.create(dto);

      expect(mockFileRepository.create).toHaveBeenCalledWith(dto, 'documents/10/5', 'doc.pdf');
      expect(mockCloudStorage.getPresignedUrlForAccessing).toHaveBeenCalledWith(
        'test-bucket',
        'documents/10/5/doc.pdf'
      );
      expect(mockMessageBroker.sendFileUrlForAIProcessing).toHaveBeenCalledWith(1, 'https://s3/example', 'course_10');
      expect(result).toEqual(createdFile);
    });

    it('should create document with lesson_id when chapter_item_id not provided', async () => {
      const dto = {
        course_id: '10',
        lesson_id: '3',
        type: ResourceType.IMAGE,
        filename: 'image.png',
        title: 'Image'
      };
      const createdFile = { id: 2, title: 'Image', path: 'images/10/3', filename: 'image.png' };

      mockFileRepository.create.mockResolvedValue(createdFile);
      mockCloudStorage.getPresignedUrlForAccessing.mockResolvedValue('https://s3/image');
      mockMessageBroker.sendFileUrlForAIProcessing.mockResolvedValue(true);

      const result = await service.create(dto);

      expect(mockFileRepository.create).toHaveBeenCalledWith(dto, 'images/10/3', 'image.png');
      expect(result).toEqual(createdFile);
    });
  });

  describe('createMany', () => {
    it('should throw BadRequestException when files contain video', async () => {
      const dto = {
        files: [
          { course_id: '10', type: ResourceType.DOCUMENT, filename: 'doc.pdf', title: 'Doc' },
          { course_id: '10', type: ResourceType.VIDEO, filename: 'video.mp4', title: 'Video' }
        ]
      };
      await expect(service.createMany(dto as any)).rejects.toThrow('Use POST /files/video/init for video uploads');
    });

    it('should create multiple documents', async () => {
      const dto = {
        files: [
          { course_id: '10', lesson_id: '5', type: ResourceType.DOCUMENT, filename: 'doc1.pdf', title: 'Doc1' },
          { course_id: '10', lesson_id: '5', type: ResourceType.IMAGE, filename: 'img1.png', title: 'Img1' }
        ]
      };
      const created = [
        { id: 1, title: 'Doc1', path: 'documents/10/5', filename: 'doc1.pdf' },
        { id: 2, title: 'Img1', path: 'images/10/5', filename: 'img1.png' }
      ];

      mockFileRepository.create.mockResolvedValueOnce(created[0]).mockResolvedValueOnce(created[1]);
      mockCloudStorage.getPresignedUrlForAccessing.mockResolvedValue('https://s3/url');
      mockMessageBroker.sendFileUrlForAIProcessing.mockResolvedValue(true);

      const result = await service.createMany(dto as any);

      expect(result).toHaveLength(2);
      expect(mockFileRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('generatePresignedUrls', () => {
    it('should throw when neither chapterItemId nor lessonId provided', async () => {
      const dto = { courseId: '10', files: [{ filename: 'file.pdf', contentType: 'application/pdf' }] };
      await expect(service.generatePresignedUrls(dto as any)).rejects.toThrow(
        'Either chapterItemId or lessonId must be provided'
      );
    });

    it('should throw when trying to upload video', async () => {
      const dto = {
        courseId: '10',
        lessonId: '5',
        files: [{ filename: 'video.mp4', contentType: 'video/mp4' }]
      };
      await expect(service.generatePresignedUrls(dto as any)).rejects.toThrow(
        'Use POST /files/video/init for video uploads'
      );
    });

    it('should throw for unsupported content type', async () => {
      const dto = {
        courseId: '10',
        lessonId: '5',
        files: [{ filename: 'file.bin', contentType: 'application/octet-stream' }]
      };
      await expect(service.generatePresignedUrls(dto as any)).rejects.toThrow('Unsupported content type');
    });

    it('should generate presigned urls for documents and images', async () => {
      const dto = {
        courseId: '10',
        chapterItemId: '5',
        files: [
          { filename: 'doc.pdf', contentType: 'application/pdf' },
          { filename: 'image.png', contentType: 'image/png' }
        ]
      };

      mockCloudStorage.getPresignedUrl.mockResolvedValue('https://s3/presigned');

      const result = await service.generatePresignedUrls(dto as any);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('presignedUrl');
      expect(result[0]).toHaveProperty('expiresAt');
      expect(result[0]).toHaveProperty('key');
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when file not found', async () => {
      mockFileRepository.findById.mockResolvedValue(null);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when delete from S3 fails', async () => {
      mockFileRepository.findById.mockResolvedValue({
        id: 1,
        path: 'documents/10/5',
        filename: 'doc.pdf'
      });
      mockCloudStorage.deleteFile.mockRejectedValue(new Error('S3 delete failed'));

      await expect(service.remove(1)).rejects.toThrow(InternalServerErrorException);
    });

    it('should delete file from S3 and database', async () => {
      mockFileRepository.findById.mockResolvedValue({
        id: 1,
        path: 'documents/10/5',
        filename: 'doc.pdf'
      });
      mockCloudStorage.deleteFile.mockResolvedValue(true);
      mockFileRepository.deleteById.mockResolvedValue({ id: 1 });

      const result = await service.remove(1);

      expect(mockCloudStorage.deleteFile).toHaveBeenCalledWith('test-bucket', 'documents/10/5/doc.pdf');
      expect(mockFileRepository.deleteById).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true });
    });
  });

  describe('initVideoUpload', () => {
    it('should reuse existing upload session if available', async () => {
      const dto = { title: 'Video', courseId: '10', lessonId: '5', fileSize: 100000000 };
      const existingSession = {
        uploadId: 'upload-id-123',
        key: 'videos/10/5/main.mp4',
        totalParts: 2,
        status: 'IN_PROGRESS'
      };

      mockFileRepository.findActiveUploadSession.mockResolvedValue(existingSession);

      const result = await service.initVideoUpload(dto);

      expect(result.uploadId).toBe('upload-id-123');
      expect(result.partSize).toBe(50 * 1024 * 1024);
    });

    it('should throw ConflictException when lesson already has a video', async () => {
      const dto = { title: 'Video', courseId: '10', lessonId: '5', fileSize: 100000000 };

      mockFileRepository.findActiveUploadSession.mockResolvedValue(null);
      mockFileRepository.findVideoByLessonId.mockResolvedValue({ id: 1, lessonId: '5' });

      await expect(service.initVideoUpload(dto)).rejects.toThrow(new ConflictException(`Lesson 5 already has a video`));
    });

    it('should create new multipart upload session', async () => {
      const dto = { title: 'Video', courseId: '10', lessonId: '5', fileSize: 100000000 };

      mockFileRepository.findActiveUploadSession.mockResolvedValue(null);
      mockFileRepository.findVideoByLessonId.mockResolvedValue(null);
      mockCloudStorage.createMultipartUpload.mockResolvedValue({ uploadId: 'upload-id-123' });
      mockFileRepository.createVideoResource.mockResolvedValue({ id: 1, uploadId: 'upload-id-123' });

      const result = await service.initVideoUpload(dto);

      expect(result.uploadId).toBe('upload-id-123');
      expect(result.totalParts).toBe(2);
      expect(mockCloudStorage.createMultipartUpload).toHaveBeenCalledWith(
        'test-bucket',
        'videos/10/5/main.mp4',
        'video/mp4'
      );
      expect(mockFileRepository.createVideoResource).toHaveBeenCalled();
    });
  });

  describe('getPartPresignedUrl', () => {
    it('should throw NotFoundException when upload session not found', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue(null);
      await expect(service.getPartPresignedUrl('invalid-upload-id', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when upload already completed', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue({
        uploadId: 'upload-id-123',
        status: 'COMPLETED'
      });
      await expect(service.getPartPresignedUrl('upload-id-123', 1)).rejects.toThrow(ConflictException);
    });

    it('should return presigned url for part', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue({
        uploadId: 'upload-id-123',
        key: 'videos/10/5/main.mp4',
        status: 'IN_PROGRESS'
      });
      mockCloudStorage.getPresignedUrlForPart.mockResolvedValue('https://s3/part-presigned-url');
      mockFileRepository.updateUploadSessionStatus.mockResolvedValue(true);

      const result = await service.getPartPresignedUrl('upload-id-123', 1);

      expect(result.partNumber).toBe(1);
      expect(result.presignedUrl).toBe('https://s3/part-presigned-url');
      expect(result).toHaveProperty('expiresAt');
      expect(mockFileRepository.updateUploadSessionStatus).toHaveBeenCalledWith('upload-id-123', 'IN_PROGRESS');
    });
  });

  describe('listUploadedParts', () => {
    it('should throw NotFoundException when upload session not found', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue(null);
      await expect(service.listUploadedParts('invalid-upload-id')).rejects.toThrow(NotFoundException);
    });

    it('should return uploaded and missing parts', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue({
        uploadId: 'upload-id-123',
        key: 'videos/10/5/main.mp4',
        totalParts: 3
      });
      mockCloudStorage.listUploadedParts.mockResolvedValue([
        { partNumber: 1, etag: 'etag-1' },
        { partNumber: 3, etag: 'etag-3' }
      ]);

      const result = await service.listUploadedParts('upload-id-123');

      expect(result.uploadedParts).toHaveLength(2);
      expect(result.missingParts).toEqual([2]);
    });
  });

  describe('completeVideoUpload', () => {
    it('should throw NotFoundException when upload session not found', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue(null);
      const dto = { parts: [{ partNumber: 1, etag: 'etag-1' }] };
      await expect(service.completeVideoUpload('invalid-upload-id', dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when upload already completed', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue({
        uploadId: 'upload-id-123',
        status: 'COMPLETED'
      });
      const dto = { parts: [{ partNumber: 1, etag: 'etag-1' }] };
      await expect(service.completeVideoUpload('upload-id-123', dto as any)).rejects.toThrow(ConflictException);
    });

    it('should complete multipart upload', async () => {
      mockFileRepository.findUploadSessionByUploadId.mockResolvedValue({
        uploadId: 'upload-id-123',
        key: 'videos/10/5/main.mp4',
        status: 'IN_PROGRESS',
        resourceId: 1
      });
      mockCloudStorage.completeMultipartUpload.mockResolvedValue(true);
      mockFileRepository.finalizeVideoUpload.mockResolvedValue({ id: 1 });

      const dto = { parts: [{ partNumber: 1, etag: 'etag-1' }] };
      const result = await service.completeVideoUpload('upload-id-123', dto as any);

      expect(result.resourceId).toBe(1);
      expect(mockCloudStorage.completeMultipartUpload).toHaveBeenCalledWith(
        'test-bucket',
        'videos/10/5/main.mp4',
        'upload-id-123',
        [{ partNumber: 1, etag: 'etag-1' }]
      );
      expect(mockFileRepository.finalizeVideoUpload).toHaveBeenCalledWith('upload-id-123', 1);
    });
  });

  describe('findResourcesByChapterItemId', () => {
    it('should return grouped resources by type', async () => {
      const resources = [
        { id: 1, type: 'document', path: 'documents/10/5', filename: 'doc.pdf' },
        { id: 2, type: 'video', path: 'videos/10/5', filename: 'video.m3u8' },
        { id: 3, type: 'image', path: 'images/10/5', filename: 'image.png' }
      ];

      mockFileRepository.findResourcesByChapterItemId.mockResolvedValue(resources);
      mockCdnService.getPresignedUrlForCloudFront.mockResolvedValue('https://cdn/url');

      const result = await service.findResourcesByChapterItemId('5');

      expect(result.document).toHaveLength(1);
      expect(result.video).toHaveLength(1);
      expect(result.image).toHaveLength(1);
      expect(mockCdnService.getPresignedUrlForCloudFront).toHaveBeenCalledTimes(3);
    });

    it('should return empty groups when no resources found', async () => {
      mockFileRepository.findResourcesByChapterItemId.mockResolvedValue([]);

      const result = await service.findResourcesByChapterItemId('5');

      expect(result.document).toEqual([]);
      expect(result.video).toEqual([]);
      expect(result.image).toEqual([]);
    });
  });

  describe('findResourcesByLessonId', () => {
    it('should delegate to findResourcesByChapterItemId', async () => {
      const resources = [{ id: 1, type: 'document', path: 'documents/10/5', filename: 'doc.pdf' }];

      mockFileRepository.findResourcesByChapterItemId.mockResolvedValue(resources);
      mockCdnService.getPresignedUrlForCloudFront.mockResolvedValue('https://cdn/url');

      const result = await service.findResourcesByLessonId('5');

      expect(result.document).toHaveLength(1);
      expect(mockFileRepository.findResourcesByChapterItemId).toHaveBeenCalledWith('5');
    });
  });
});
