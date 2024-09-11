for f in ./.tmp/*.jpg; do
  bn=$(basename $f);
  ffmpeg -i "$f" "./img/xl/$bn";
  ffmpeg -i "$f" -vf scale=256:-1 "./img/xs/$bn";

  sn=${bn%.*};
  it=$(echo "$sn" | cut -d'_' -f 1);
  cp "$HOME/Music/Inst/$it/$sn.mp3" ./mp3/;

  keynote=$(echo "$sn" | cut -d'_' -f 2);
  keynote=${keynote/[0-9]/};
  echo "<a><img class='$keynote' src='/img/xs/$bn' loading='lazy'></a>" >> ./.tmp/list.html;
done
