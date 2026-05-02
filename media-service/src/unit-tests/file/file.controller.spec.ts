import { Test, TestingModule } from '@nestjs/testing';
import { FileController } from '../../modules/file/file.controller';
import { FileService } from '../../modules/file/file.service';
import { Logger } from '@nestjs/common';

const mockFileService = {
  create: jest.fn(),
  getPresignedUrlForS3Uploading: jest.fn(),
  findResourcesByChapterItemId: jest.fn(),
  findResourcesByLessonId: jest.fn(),
  remove: jest.fn()
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

  it('create should call service and return ApiResponse', async () => {
    const dto: any = { course_id: '10', type: 'image', filename: 'a.png' };
    const created = { id: '1', title: 't' };

    mockFileService.create.mockResolvedValue(created);

    const result = await controller.create(dto);

    expect(mockFileService.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({
      success: true,
      data: created,
      message: 'Save record successfully'
    });
  });

  it('getPresignedUrlForS3Uploading should call service and return ApiResponse', async () => {
    mockFileService.getPresignedUrlForS3Uploading.mockResolvedValue('https://presign');

    const res = await controller.getPresignedUrlForS3Uploading('a.png', '10', '100');

    expect(mockFileService.getPresignedUrlForS3Uploading).toHaveBeenCalledWith('a.png', '10', '100');

    expect(res).toMatchObject({
      success: true,
      data: 'https://presign',
      message: 'Presigned URL retrieved successfully.'
    });
  });

  it('findResourcesByChapterItemId should return grouped resources', async () => {
    const grouped = { document: [], video: [], image: [] };

    mockFileService.findResourcesByChapterItemId.mockResolvedValue(grouped);

    const res = await controller.findResourcesByChapterItemId('100');

    expect(mockFileService.findResourcesByChapterItemId).toHaveBeenCalledWith('100');

    expect(res).toMatchObject({
      success: true,
      message: '',
      data: grouped
    });
  });

  it('findResourcesByLessonId should delegate to service', async () => {
    const grouped = { document: [], video: [], image: [] };

    mockFileService.findResourcesByLessonId.mockResolvedValue(grouped);

    const res = await controller.findResourcesByLessonId('200');

    expect(mockFileService.findResourcesByLessonId).toHaveBeenCalledWith('200');

    expect(res).toMatchObject({
      success: true,
      message: '',
      data: grouped
    });
  });

  it('remove should delegate to service', async () => {
    mockFileService.remove.mockResolvedValue({ success: true });

    const res = await controller.remove('1');

    expect(mockFileService.remove).toHaveBeenCalledWith(1);
    expect(res).toEqual({ success: true });
  });
});
