import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { FileService } from '../../modules/file/file.service';
import { FileRepository } from '../../modules/file/file.repository';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_BROKER } from '../../modules/message-broker/message-broker.token';

const mockFileRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  deleteById: jest.fn(),
  findResourcesByChapterItemId: jest.fn()
};

const mockCloudStorage = {
  getPresignedUrlForAccessing: jest.fn(),
  extractKeyFromUrl: jest.fn(),
  deleteFile: jest.fn(),
  getPresignedUrl: jest.fn()
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
    it('should throw when no owner id provided', async () => {
      await expect(service.create({} as any)).rejects.toThrow(BadRequestException);
    });

    it('should create, generate url and send message', async () => {
      const dto: any = { course_id: '10', type: 'document', filename: 'doc.pdf', title: 't' };
      mockFileRepository.create.mockResolvedValue({ id: '1', title: 't' });
      mockCloudStorage.getPresignedUrlForAccessing.mockResolvedValue('https://s3/example');
      mockMessageBroker.sendFileUrlForAIProcessing.mockResolvedValue(true);

      const res = await service.create(dto);

      expect(mockFileRepository.create).toHaveBeenCalled();
      expect(mockCloudStorage.getPresignedUrlForAccessing).toHaveBeenCalled();
      expect(mockMessageBroker.sendFileUrlForAIProcessing).toHaveBeenCalledWith('1', 'https://s3/example', 'course_10');
      expect(res).toEqual({ id: '1', title: 't' });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when file not found', async () => {
      mockFileRepository.findById.mockResolvedValue(null);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when file has no link', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 1, link: null });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException when delete fails', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 1, link: 'https://s3/key' });
      mockCloudStorage.extractKeyFromUrl.mockReturnValue('key');
      mockCloudStorage.deleteFile.mockRejectedValue(new Error('fail'));

      await expect(service.remove(1)).rejects.toThrow(InternalServerErrorException);
    });

    it('should delete and remove record', async () => {
      mockFileRepository.findById.mockResolvedValue({ id: 1, link: 'https://s3/key' });
      mockCloudStorage.extractKeyFromUrl.mockReturnValue('key');
      mockCloudStorage.deleteFile.mockResolvedValue(true);
      mockFileRepository.deleteById.mockResolvedValue({ id: 1 });

      const res = await service.remove(1);
      expect(mockCloudStorage.deleteFile).toHaveBeenCalledWith('test-bucket', 'key');
      expect(mockFileRepository.deleteById).toHaveBeenCalledWith(1);
      expect(res).toEqual({ success: true });
    });
  });

  describe('getPresignedUrlForS3Uploading', () => {
    it('should return presigned url for supported types', () => {
      mockCloudStorage.getPresignedUrl.mockReturnValue('https://presign');
      const url = service.getPresignedUrlForS3Uploading('file.jpg', '10', '100');
      expect(url).toBe('https://presign');
      expect(mockCloudStorage.getPresignedUrl).toHaveBeenCalled();
    });

    it('should throw for unsupported types', () => {
      expect(() => service.getPresignedUrlForS3Uploading('file.exe', '10', '100')).toThrow(BadRequestException);
    });
  });

  describe('findResourcesByChapterItemId', () => {
    it('should group resources and add cdn links', async () => {
      const resources = [
        { id: 1, type: 'document', path: 'documents/10/100', filename: 'doc.pdf' },
        { id: 2, type: 'video', path: 'videos/10/100', filename: 'v.m3u8' }
      ];
      mockFileRepository.findResourcesByChapterItemId.mockResolvedValue(resources);
      mockCdnService.getPresignedUrlForCloudFront.mockResolvedValue('https://cdn/link');

      const res = await service.findResourcesByChapterItemId('100');

      expect(mockFileRepository.findResourcesByChapterItemId).toHaveBeenCalledWith('100');
      expect(res.document.length).toBe(1);
      expect(res.video.length).toBe(1);
      expect(res.image.length).toBe(0);
    });
  });
});
