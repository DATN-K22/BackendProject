import { Test, TestingModule } from '@nestjs/testing'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { LabController } from '../../modules/lab/lab.controller'
import { LabService } from '../../modules/lab/lab.service'

jest.mock('../../utils/dto/ApiResponse', () => ({
  ApiResponse: {
    OkResponse: jest.fn((data, message?) => ({ success: true, data, message }))
  }
}))

const mockLabService = {
  getLabHistory: jest.fn(),
  getConsoleUrl: jest.fn(),
  getLeaseById: jest.fn(),
  startLab: jest.fn()
}

describe('LabController', () => {
  let controller: LabController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabController],
      providers: [{ provide: LabService, useValue: mockLabService }]
    }).compile()

    controller = module.get<LabController>(LabController)
    jest.clearAllMocks()
  })

  describe('getLabHistory', () => {
    it('should return lab history with default page size', async () => {
      const history = [{ leaseId: 'lease-1' }]
      mockLabService.getLabHistory.mockResolvedValue(history)

      const result = await controller.getLabHistory('user-1', 'template-1')

      expect(mockLabService.getLabHistory).toHaveBeenCalledWith('user-1', 'template-1', 10)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(history)
      expect(result).toEqual({ success: true, data: history, message: undefined })
    })

    it('should forward custom page size to service', async () => {
      mockLabService.getLabHistory.mockResolvedValue([])

      await controller.getLabHistory('user-1', 'template-1', 25)

      expect(mockLabService.getLabHistory).toHaveBeenCalledWith('user-1', 'template-1', 25)
    })
  })

  describe('getConsoleUrl', () => {
    it('should map body to service input and return console url response', async () => {
      const body = {
        leaseId: 'lease-1',
        uuid: 'uuid-1',
        awsAccountId: '123456789012',
        leaseDurationInHours: 2,
        expirationDate: '2026-01-01T00:00:00Z',
        blueprintId: 'blueprint-1',
        originalLeaseTemplateUuid: 'template-1'
      }
      const serviceResult = { consoleUrl: 'https://console.aws.amazon.com/' }
      mockLabService.getConsoleUrl.mockResolvedValue(serviceResult)

      const result = await controller.getConsoleUrl(body as any)

      expect(mockLabService.getConsoleUrl).toHaveBeenCalledWith(body)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(serviceResult)
      expect(result).toEqual({ success: true, data: serviceResult, message: undefined })
    })
  })

  describe('getLeaseById', () => {
    it('should return lease by id', async () => {
      const lease = { leaseId: 'lease-1' }
      mockLabService.getLeaseById.mockResolvedValue(lease)

      const result = await controller.getLeaseById('lease-1')

      expect(mockLabService.getLeaseById).toHaveBeenCalledWith('lease-1')
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(lease)
      expect(result).toEqual({ success: true, data: lease, message: undefined })
    })
  })

  describe('startLab', () => {
    it('should start lab and wrap response', async () => {
      const payload = { leaseTemplateUuid: 'template-1', userId: 'user-1' }
      const serviceResult = { leaseId: 'encoded-lease-id' }
      mockLabService.startLab.mockResolvedValue(serviceResult)

      const result = await controller.startLab(payload)

      expect(mockLabService.startLab).toHaveBeenCalledWith(payload)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(serviceResult)
      expect(result).toEqual({ success: true, data: serviceResult, message: undefined })
    })
  })
})
