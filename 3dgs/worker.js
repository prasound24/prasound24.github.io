const meshes = {};

self.onmessage = async (e) => {
    let { type, name, txid, cw, ch, args } = e.data;

    if (type != 'mesh')
        throw new Error('Invalid command: ' + type);

    if (!/^\w+$/.test(name))
        throw new Error('Invalid mesh: ' + name);

    meshes[name] = meshes[name] ||
        await import('./mesh/' + name + '.js');

    let { str4, xyzw, rgba } = meshes[name].createMesh(cw, ch, args);
    
    postMessage({ txid, str4, xyzw, rgba },
        [str4.buffer, xyzw.buffer, rgba.buffer]);
};
