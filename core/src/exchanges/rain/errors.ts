import { ErrorMapper } from '../../utils/error-mapper';

export class RainErrorMapper extends ErrorMapper {
    constructor() {
        super('Rain');
    }
}

export const rainErrorMapper = new RainErrorMapper();
