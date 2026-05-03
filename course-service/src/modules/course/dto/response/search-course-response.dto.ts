import { CourseLevel } from '../request/filter-option.dto';

export class CourseCreatorDto {
  id: string;
  name: string;
  avt_url: string;
}

export class SearchCourseItemDto {
  id: string;
  title: string;
  thumbnail_url: string | null;
  price: number;
  course_level: string;
  rating: number;
  short_description: string | null;
  created_at: Date;
  user?: CourseCreatorDto;
}

export class SearchMetaDto {
  totalItems: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class FacetsDto {
  levels: Record<string, number>;
  priceTypes: {
    FREE: number;
    PAID: number;
  };
}

export class SearchCourseResponseDto {
  data: SearchCourseItemDto[];
  meta: SearchMetaDto;
  facets: FacetsDto;
}
