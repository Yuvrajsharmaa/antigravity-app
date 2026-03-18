import { ImageSourcePropType } from 'react-native';
import { CoveVariant } from '../models/types';

const primaryCove = require('../../../Mascot/mascot.png');

export const coveAssetMap: Record<CoveVariant, ImageSourcePropType> = {
  default: primaryCove,
  welcome: primaryCove,
  listening: primaryCove,
  thinking: primaryCove,
  celebration: primaryCove,
  tiny: primaryCove,
};
