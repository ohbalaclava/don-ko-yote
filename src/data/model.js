import gobugobu from './gobu-gobu';
import shichisan from './shichisan';

const model = (function () {
  const jiuchis = [gobugobu, shichisan];

  let currentJiuchi = shichisan;

  const setCurrentJiuchi = (jiuchi) => {
    currentJiuchi = jiuchi;
  };

  const getCurrentJiuchi = () => {
    return currentJiuchi;
  };

  const getJiuchis = () => {
    return jiuchis;
  };

  return {
    setCurrentJiuchi,
    getCurrentJiuchi,
    getJiuchis,
  };
})();

export default model;
